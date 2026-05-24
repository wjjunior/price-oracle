/**
 * @file `POST /api/diagnose?asset=...` — the operator-driven LLM
 * explainer.
 *
 * **What this controller does, end-to-end.**
 *
 *  1. Validate `asset` (pipe → `AssetParamPipe`) and the body (pipe
 *     → `DiagnoseBodyPipe` against `PostDiagnoseRequestSchema`).
 *  2. Build a `DiagnoseContext` from the orchestrator's read-only
 *     accessors plus a recent-audit pull (20 events for the asset).
 *  3. Append a `DiagnoseRequested` audit event (best-effort).
 *  4. Call `DiagnosePort.diagnose(context)` — the rate-limited
 *     decorator's `inFlight` map may join concurrent identical
 *     requests; the inner adapter is either Anthropic (real key) or
 *     the stub (no key). Composition decided at boot — see
 *     `decisions.md` Entry 6.
 *  5. Catch the two typed errors via `instanceof` (CLAUDE.md rule
 *     19): `DiagnoseRateLimitedError` → HTTP 429 with
 *     `retryAfterMs`; `DiagnoseUnavailableError` → HTTP 503.
 *  6. Append a `DiagnoseAnswered` audit event with the latency and
 *     token count (best-effort).
 *  7. Return `{ asset, markdown, latencyMs, tokensUsed,
 *     generatedAt }` to the dashboard, which renders the Markdown
 *     via `react-markdown`.
 *
 * **Two audit events per request.** The `Requested` / `Answered`
 * pair is what powers the dashboard's "LLM round-trip: X ms"
 * indicator without inferring it from a SSE delta. Both calls go
 * through `appendBestEffort` — a Mongo outage logs `warn` and
 * continues (CLAUDE.md operational quirks).
 *
 * **Why `Date.now()` here.** The diagnose controller is in
 * `interface/`, not `domain/`. CLAUDE.md rule 16 ("domain is pure")
 * does not apply — the wall-clock at request time is exactly the
 * right value for the `at` field on the audit event.
 *
 * **Rate-limit response shape.** `{ error: 'rate_limited',
 * retryAfterMs }` — the dashboard reads `retryAfterMs` to render a
 * countdown without polling. This is also why the
 * `DiagnoseRateLimitedError` class carries `retryAfterMs` as a
 * typed field rather than encoding it into a string message.
 *
 * **Unavailability response shape.** `{ error: 'diagnose_unavailable' }`
 * — intentionally opaque; we do not leak the underlying SDK error
 * to the client. The full error (with `cause`) is logged at `warn`
 * server-side so an operator triaging an outage has the detail.
 *
 * Cross-references:
 *  - `domain/ports/diagnose.port.ts`: port + the two typed errors.
 *  - `infrastructure/diagnose/rate-limited-diagnose.decorator.ts`:
 *    rate-limit + dedup wrapper.
 *  - `infrastructure/diagnose/create-diagnose-port.ts`: composition-
 *    time adapter selector.
 *  - `decisions.md` Entry 6.
 *  - `frontend/dashboard/src/widgets/diagnose-card`: consumer.
 */
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { buildDiagnoseAnsweredEvent, buildDiagnoseRequestedEvent } from '@price-oracle/contracts/events';

import { Orchestrator } from '../application/orchestrator.js';
import { AUDIT_PORT } from '../domain/ports/audit.port.js';
import {
  DIAGNOSE_PORT,
  DiagnoseRateLimitedError,
  DiagnoseUnavailableError,
} from '../domain/ports/diagnose.port.js';

import { AssetParamPipe } from './asset-param.pipe.js';
import { DiagnoseBodyPipe } from './diagnose-body.pipe.js';
import { LOGGER } from './tokens.js';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { DiagnoseContext, DiagnosePort } from '../domain/ports/diagnose.port.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, CorrelationId } from '@price-oracle/contracts/primitives';
import type { PostDiagnoseRequest, PostDiagnoseResponse } from '@price-oracle/contracts/rest';
import type { Logger } from 'pino';

const DIAGNOSE_EVENT = 'http.diagnose';
const DEFAULT_TRIGGER = 'manual';
/**
 * How many recent audit events to pull into the diagnose context.
 * 20 is the balance between "enough story for the LLM" and "not so
 * much that the prompt blows past Haiku's context budget on a busy
 * asset." The number is also low enough that the rate-limit
 * decorator's dedup hash stays stable across rapid clicks
 * (`hashDiagnoseContext` includes the event list).
 */
const RECENT_EVENTS_LIMIT = 20;
const RATE_LIMITED_ERROR = 'rate_limited';
const UNAVAILABLE_ERROR = 'diagnose_unavailable';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : inspect(error);

@Controller('api')
export class DiagnoseController {
  constructor(
    @Inject(Orchestrator) private readonly orchestrator: Orchestrator,
    @Inject(DIAGNOSE_PORT) private readonly diagnose: DiagnosePort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * `POST /api/diagnose?asset=...`. Returns 200 with the response
   * body on success, or maps the two typed port errors to 429 /
   * 503 with structured bodies the dashboard can render directly.
   *
   * `@HttpCode(HttpStatus.OK)` is explicit because NestJS defaults
   * `@Post` to 201; we want 200 here since no resource is created.
   */
  @Post('diagnose')
  @HttpCode(HttpStatus.OK)
  async requestDiagnose(
    @Query('asset', AssetParamPipe) asset: AssetId,
    @Body(DiagnoseBodyPipe) body: PostDiagnoseRequest,
  ): Promise<PostDiagnoseResponse> {
    const correlationId: CorrelationId = randomUUID();
    this.logger.info({ event: DIAGNOSE_EVENT, asset, correlationId }, 'Diagnose requested');

    // Build the context from orchestrator state + recent audit. The
    // orchestrator accessors are synchronous (in-memory); the only
    // I/O on this path is the Mongo `recent(...)` call.
    const recentEvents = await this.audit.recent(RECENT_EVENTS_LIMIT, asset);
    const context: DiagnoseContext = {
      asset,
      confidence: this.orchestrator.getSnapshot(asset)?.confidence ?? 0,
      breaker: this.orchestrator.getBreakerState(asset),
      recentEvents,
      sources: [...this.orchestrator.getSourceStates(asset)],
    };

    // Audit before dispatch so the "Requested" event appears even
    // if the upstream errors. `trigger` defaults to `manual` —
    // future automated triggers can override via the body.
    await this.appendBestEffort(
      buildDiagnoseRequestedEvent({ asset, trigger: body.trigger ?? DEFAULT_TRIGGER, at: Date.now() }),
      correlationId,
    );

    const result = await this.runDiagnose(context, asset, correlationId);

    // Audit the answer with latency + token count. `tokensUsed` is
    // optional on the contract — the stub adapter omits it.
    await this.appendBestEffort(
      buildDiagnoseAnsweredEvent({
        asset,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed,
        at: Date.now(),
      }),
      correlationId,
    );

    return {
      asset,
      markdown: result.markdown,
      latencyMs: result.latencyMs,
      tokensUsed: result.tokensUsed,
      generatedAt: Date.now(),
    };
  }

  /**
   * Wrap the port call in the typed-error → HTTP mapper.
   *
   *  - `DiagnoseRateLimitedError` → 429 + `retryAfterMs`. Logged at
   *    `info` because rate-limiting is expected behavior, not a
   *    failure.
   *  - `DiagnoseUnavailableError` → 503 + opaque body. Logged at
   *    `warn` because the upstream is degraded but the system is
   *    still responsive.
   *  - Any other error rethrows untouched — NestJS's default
   *    exception filter turns it into a 500 with the standard body.
   */
  private async runDiagnose(
    context: DiagnoseContext,
    asset: AssetId,
    correlationId: CorrelationId,
  ): Promise<Awaited<ReturnType<DiagnosePort['diagnose']>>> {
    try {
      return await this.diagnose.diagnose(context);
    } catch (error) {
      if (error instanceof DiagnoseRateLimitedError) {
        // Rate limiting is expected operator behavior — info, not warn.
        this.logger.info(
          { event: DIAGNOSE_EVENT, asset, correlationId, outcome: RATE_LIMITED_ERROR },
          'Diagnose rate limited',
        );
        throw new HttpException(
          { error: RATE_LIMITED_ERROR, retryAfterMs: error.retryAfterMs },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof DiagnoseUnavailableError) {
        this.logger.warn(
          { event: DIAGNOSE_EVENT, asset, correlationId, error: errorMessage(error) },
          'Diagnose unavailable',
        );
        throw new HttpException(
          { error: UNAVAILABLE_ERROR },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }

  /**
   * Fail-safe audit append for the two diagnose events. Same
   * `warn`-and-continue stance as the orchestrator's `appendAudit`:
   * a Mongo outage must not stop the diagnose request from
   * completing. CLAUDE.md operational quirks.
   */
  private async appendBestEffort(event: AuditEvent, correlationId: CorrelationId): Promise<void> {
    try {
      await this.audit.append(event);
    } catch (error) {
      this.logger.warn(
        {
          event: 'http.diagnose.audit-failed',
          auditType: event.type,
          asset: event.asset,
          correlationId,
          error: errorMessage(error),
        },
        'Diagnose audit append failed',
      );
    }
  }
}
