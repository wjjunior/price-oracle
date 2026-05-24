/**
 * @file `GET /api/audit?limit=...&asset=...` — paginated audit feed.
 *
 * **What this is for.** The dashboard's audit-timeline widget polls
 * (or initially loads) this endpoint to render the history of
 * source-state transitions, breaker trips, anomaly detections, and
 * diagnose request/answer pairs. Live updates after the initial
 * load come via the SSE stream (`/api/stream`); this endpoint
 * exists for hydration and for "scroll back" — the SSE pulse only
 * carries new events.
 *
 * **Two query parameters, both via pipes:**
 *  - `limit` (via `AuditLimitPipe`): defaults to 50, capped at 200,
 *    bogus inputs degrade to the default. See the pipe file header
 *    for the "degrade rather than reject" reasoning.
 *  - `asset` (via `OptionalAssetParamPipe`): missing means "across
 *    all assets"; present must be a valid `AssetId`. Bad asset
 *    values produce HTTP 400.
 *
 * **Boundary copy on `events`.** `AuditPort.recent` returns
 * `readonly AuditEvent[]` (the contract type), and the response
 * field is plain `AuditEvent[]`. `[...events]` spreads into a
 * mutable array exactly once at the response edge.
 *
 * **Correlation ID logged but not returned.** Same pattern as
 * `snapshot.controller.ts` — REST audit requests are stateless from
 * the dashboard's point of view, but the controller writes one
 * `info` log line per request with the asset, limit, and a fresh
 * `randomUUID()` correlation ID so an operator grepping logs can
 * trace any single request's lifecycle.
 *
 * **DI tokens explicit (CLAUDE.md operational quirks).** Same
 * `tsx`-metadata-not-emitted reason that applies everywhere else.
 *
 * Cross-references:
 *  - `infrastructure/mongo-audit.ts::recent`: the read-side adapter.
 *  - `audit-limit.pipe.ts`, `optional-asset-param.pipe.ts`: the two
 *    pipes.
 *  - `@price-oracle/contracts/rest::GetAuditResponse`: the wire
 *    contract.
 *  - `frontend/dashboard/src/widgets/audit-timeline`: the consumer.
 */
import { randomUUID } from 'node:crypto';

import { Controller, Get, Inject, Query } from '@nestjs/common';

import { AUDIT_PORT } from '../domain/ports/audit.port.js';

import { AuditLimitPipe } from './audit-limit.pipe.js';
import { OptionalAssetParamPipe } from './optional-asset-param.pipe.js';
import { LOGGER } from './tokens.js';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { AssetId } from '@price-oracle/contracts/primitives';
import type { GetAuditResponse } from '@price-oracle/contracts/rest';
import type { Logger } from 'pino';

const AUDIT_EVENT = 'http.audit';

@Controller('api')
export class AuditController {
  constructor(
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Fetch the most recent `limit` audit events, optionally filtered
   * by `asset`. Returns `{ events: [...] }` with the events in
   * newest-first order (the Mongo adapter sorts by `at` DESC).
   *
   * Notable: the Mongo adapter is **fail-safe** — a read failure
   * returns `[]`, which renders cleanly in the dashboard as
   * "no events yet". The endpoint never returns 5xx for Mongo
   * issues.
   */
  @Get('audit')
  async recentAudit(
    @Query('limit', AuditLimitPipe) limit: number,
    @Query('asset', OptionalAssetParamPipe) asset: AssetId | undefined,
  ): Promise<GetAuditResponse> {
    const correlationId = randomUUID();
    this.logger.info({ event: AUDIT_EVENT, asset, correlationId, limit }, 'Audit requested');
    const events = await this.audit.recent(limit, asset);
    // Boundary copy: contract type is mutable `AuditEvent[]`, the
    // port returns `readonly AuditEvent[]`.
    return { events: [...events] };
  }
}
