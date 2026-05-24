/**
 * @file `DiagnosePort` — the domain's contract for "explain the
 * current price-feed state to an operator".
 *
 * **Why a port for an LLM call.** The diagnose feature is the
 * canonical example of why ports/adapters earn their keep in this
 * codebase:
 *
 *  - Two real adapters live behind this interface
 *    (`infrastructure/diagnose/anthropic-diagnose.adapter.ts` and
 *    `infrastructure/diagnose/stub-diagnose.adapter.ts`), plus the
 *    cross-cutting rate-limit decorator
 *    (`rate-limited-diagnose.decorator.ts`).
 *  - The choice of adapter is **composition-time**, not runtime.
 *    See `infrastructure/diagnose/create-diagnose-port.ts` for the
 *    selector and `decisions.md` Entry 6 for the rationale: a
 *    runtime feature flag (`if (apiKey) { ... } else { ... }`) would
 *    leak "is the API key set?" knowledge into the use case and
 *    create a code path that no demo would exercise.
 *  - The orchestrator and diagnose controller code is identical
 *    whether the real or stub adapter is wired in — this is the
 *    property the port preserves.
 *
 * **The contract.** A single async method that takes a snapshot of
 * "what the operator would want to look at" (`DiagnoseContext`) and
 * returns a Markdown explanation plus latency / token metadata
 * (`DiagnoseResult`). The Markdown is rendered verbatim by the
 * dashboard's diagnose card via `react-markdown`.
 *
 * **Why the typed errors.** CLAUDE.md rule 19 — errors are typed,
 * not strings. Two named subclasses cover the failure modes:
 *
 *  - `DiagnoseRateLimitedError` — the decorator refused the request
 *    because the per-asset rate-limit window has not elapsed.
 *    Carries `retryAfterMs` so the controller can return it in the
 *    HTTP 429 response.
 *  - `DiagnoseUnavailableError` — the upstream (Anthropic SDK)
 *    failed, timed out, or returned no text. Carries an optional
 *    `cause` for log triage.
 *
 * The diagnose controller (`interface/diagnose.controller.ts`) reads
 * these via `instanceof` and maps them to HTTP status codes (429 /
 * 503) — no string-`.includes()` checks.
 *
 * Cross-references:
 *  - `decisions.md` Entry 6 (composition-time diagnose adapter).
 *  - CLAUDE.md operational quirks → "Anthropic stub fallback
 *    preserves end-to-end runnability without secrets."
 *  - `infrastructure/diagnose/`: all three adapter files plus the
 *    rate-limit decorator and the dedup hash.
 *  - `interface/diagnose.controller.ts`: the HTTP-side caller.
 */
import type { BreakerState, SourceState } from '../types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, Confidence } from '@price-oracle/contracts/primitives';

/**
 * Snapshot of the per-asset state the LLM (or stub) is asked to
 * explain. Built fresh by the diagnose controller for each request
 * from the orchestrator's getters (`getSnapshot`,
 * `getBreakerState`, `getSourceStates`) plus a recent-audit pull.
 *
 * Important: this context is also the deduplication key for the
 * rate-limit decorator (via `hashDiagnoseContext`). Two requests
 * with structurally identical contexts get joined onto the same
 * in-flight promise — no duplicate spend, no duplicate audit event.
 */
export type DiagnoseContext = {
  readonly asset: AssetId;
  readonly confidence: Confidence;
  readonly breaker: BreakerState;
  readonly recentEvents: readonly AuditEvent[];
  readonly sources: readonly SourceState[];
};

/**
 * Adapter output. `latencyMs` is wall-clock from request to response
 * (measured by the adapter's `clock`). `tokensUsed` is optional
 * because the stub doesn't have a token count — the union with
 * `undefined` is what lets the controller cleanly omit the field in
 * the SSE / REST payload without a sentinel value.
 */
export type DiagnoseResult = {
  readonly markdown: string;
  readonly latencyMs: number;
  readonly tokensUsed?: number;
};

/**
 * The port itself. Single method by design — the port should be
 * narrow enough that swapping adapters is a one-file change.
 */
export interface DiagnosePort {
  diagnose(context: DiagnoseContext): Promise<DiagnoseResult>;
}

/**
 * DI token. See the note on `AUDIT_PORT` for why this is a
 * `Symbol.for(...)` rather than a class reference.
 */
export const DIAGNOSE_PORT = Symbol.for('@price-oracle/aggregator/diagnose-port');

/**
 * The rate-limit decorator refused the request — the per-asset
 * window has not elapsed since the last accepted call.
 *
 * `retryAfterMs` is the remaining cooldown; the diagnose controller
 * surfaces it in the HTTP 429 response body so the dashboard can
 * display a countdown without polling. CLAUDE.md rule 19.
 */
export class DiagnoseRateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('diagnose rate limit exceeded');
    this.name = 'DiagnoseRateLimitedError';
  }
}

/**
 * The upstream adapter could not produce a result. Two causes today:
 *  - Anthropic SDK call threw, timed out, or returned no text content.
 *  - (Future) any other transient failure that should surface as
 *    HTTP 503 to the dashboard.
 *
 * `cause` is the underlying error from the SDK, preserved on
 * `options.cause` (TC39 standard) so pino can log it with the full
 * stack on the controller side.
 */
export class DiagnoseUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DiagnoseUnavailableError';
  }
}
