/**
 * @file Primitive value types shared across every service boundary.
 *
 * These are the atoms of the contract surface: every other schema (Tick,
 * AggregatePrice, AuditEvent, SSE envelope, REST request/response) is
 * composed from them. Keeping them in one file means the entire system
 * agrees on what an `AssetId` looks like, what range a `Confidence`
 * lives in, and how a timestamp is encoded — there is no second source
 * of truth in any app.
 *
 * Every primitive is defined twice on purpose:
 *  - the Zod schema (e.g. `AssetId = z.enum(...)`), used at boundaries
 *    to parse incoming payloads from NATS, REST, env vars, and Mongo;
 *  - the inferred TypeScript type (e.g. `type AssetId = z.infer<...>`),
 *    used inside the domain after the parse has happened.
 *
 * The two share a name on purpose (this is legal TS — values and types
 * live in different namespaces) so a domain function can simply ask for
 * an `AssetId` and downstream callers know it must come from a parsed
 * source, not a raw string.
 */
import { z } from 'zod';

/**
 * Closed set of assets the system supports today.
 *
 * Why an enum, not a free string: the entire pipeline (NATS subjects,
 * audit collections, dashboard widgets) is asset-parameterized. Adding
 * an asset is a deliberate, codebase-wide change — a typo'd "btv"
 * should never reach production by accident.
 */
export const AssetId = z.enum(['btc', 'eth']);
export type AssetId = z.infer<typeof AssetId>;

/**
 * Closed set of price sources. `mock` is a real source from the
 * aggregator's point of view — it speaks the same Tick contract as
 * Binance and Coinbase. The only thing that makes it "the mock" is
 * that it owns the chaos admin API (see ingestor-mock).
 *
 * Adding a new exchange means extending this enum and wiring a new
 * adapter app; the aggregator core does not change.
 */
export const SourceId = z.enum(['binance', 'coinbase', 'mock']);
export type SourceId = z.infer<typeof SourceId>;

/**
 * Coarse per-source health classification, surfaced in the dashboard
 * and used by the aggregator when deciding whether a source's last
 * price should still contribute to the aggregate.
 *
 *  - HEALTHY:   recent ticks, treated as fresh.
 *  - DEGRADED:  ticks are slowing down — still contributes, but the
 *               freshness factor begins to decay.
 *  - STALE:     last tick is too old to trust — source is excluded
 *               from the aggregate until it recovers.
 *
 * Promotion / demotion between these states is anti-flapped by the
 * source state machine (see `apps/aggregator/src/domain/source-state/`),
 * which requires a consecutive streak before changing health.
 */
export const SourceHealth = z.enum(['HEALTHY', 'DEGRADED', 'STALE']);
export type SourceHealth = z.infer<typeof SourceHealth>;

/**
 * Per-asset circuit breaker state.
 *
 *  - CLOSED:    normal operation; aggregate is published.
 *  - OPEN:      confidence has been below the floor for the trip
 *               streak; the aggregator may still publish but the
 *               dashboard treats the price as "do not act on this".
 *  - HALF_OPEN: the recovery window has elapsed; we accept probes —
 *               if a streak of probes is healthy, transition to
 *               CLOSED, otherwise fall back to OPEN.
 *
 * The full FSM lives in `apps/aggregator/src/domain/breaker/`.
 */
export const BreakerState = z.enum(['CLOSED', 'HALF_OPEN', 'OPEN']);
export type BreakerState = z.infer<typeof BreakerState>;

const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;

/**
 * Normalized confidence in `[0, 1]`. Produced by the aggregation
 * formula `freshness * agreement * coverage` (see
 * `aggregation/confidence.ts`). Used to gate the breaker, color the
 * dashboard, and decide whether downstream consumers should act on
 * the published price.
 *
 * The closed interval is enforced at the boundary — internal domain
 * code can trust it and skip clamping.
 */
export const Confidence = z.number().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX);
export type Confidence = z.infer<typeof Confidence>;

/**
 * A price quoted in the source's native currency (USD across the
 * supported sources today). Strictly positive — a non-positive price
 * is a broken parse, not a legitimate market value, and we want it
 * rejected at the boundary before it can poison the median.
 */
export const Price = z.number().positive();
export type Price = z.infer<typeof Price>;

/**
 * A timestamp in milliseconds since the Unix epoch, or any duration
 * in milliseconds. Integer-valued and non-negative — every API in
 * the codebase (`Date.now()`, NATS broker timestamps, Mongo `at`
 * fields) speaks ms, so this is the canonical time unit.
 *
 * Domain code receives `now` as a parameter so it can stay pure
 * (see CLAUDE.md rule 16 and `decisions.md` entry 5).
 */
export const Millis = z.number().int().nonnegative();
export type Millis = z.infer<typeof Millis>;

/**
 * Correlation ID that follows a tick (or a diagnose request) end-to-end
 * across services: it is set at the ingestor, carried in the NATS
 * message header (`CORRELATION_HEADER` in `subjects.ts`), logged by
 * every pino call, attached to the SSE envelope, and rendered in the
 * dashboard's audit timeline. Grepping a single correlation ID across
 * per-service logs reconstructs the lifecycle.
 *
 * Validated as a non-empty string — generation strategy (UUID, ULID,
 * nanoid) is the ingestor's choice and not part of the contract.
 */
export const CorrelationId = z.string().min(1);
export type CorrelationId = z.infer<typeof CorrelationId>;
