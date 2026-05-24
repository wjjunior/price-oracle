/**
 * @file `AuditPort` — the domain's contract for the durable audit
 * surface.
 *
 * **Hexagonal port (CLAUDE.md rule 14).** This file lives in
 * `domain/` and imports nothing concrete: no Mongo, no NestJS, no
 * pino. It defines *what the domain needs* from a persistent audit
 * store. The Mongo adapter (`infrastructure/mongo-audit.ts`)
 * implements this port; tests use an in-memory fake that implements
 * the same shape. Swapping Mongo for PostgreSQL is a new adapter, not
 * a domain change.
 *
 * **The four operations.**
 *
 *  - `append(event)`:
 *      Insert one audit event (a `SourceStateChanged`,
 *      `BreakerStateChanged`, `AnomalyDetected`,
 *      `DiagnoseRequested`, or `DiagnoseAnswered` — see
 *      `@price-oracle/contracts/events/audit-event.ts`). The
 *      adapter is **fail-safe**: a Mongo outage downgrades the audit
 *      history but does **not** stop the aggregator from publishing
 *      its aggregate on NATS. CLAUDE.md operational quirks: "MongoDB
 *      writes are off the hot publish path." The orchestrator wraps
 *      every `append()` call in a try/catch that logs `warn` and
 *      continues — see `orchestrator.ts::appendAudit`.
 *
 *  - `recent(limit, asset?)`:
 *      Return the most-recent `limit` audit events, optionally
 *      filtered by asset. Drives `GET /api/audit` (the dashboard's
 *      audit-timeline widget) and the diagnose controller's context
 *      assembly.
 *
 *  - `recordAggregate(aggregate)`:
 *      Persist (upsert) the latest aggregate per asset. The Mongo
 *      adapter writes this to a separate collection keyed by asset,
 *      so each asset has exactly one row at all times. The
 *      orchestrator drains writes here with a queue
 *      (`orchestrator.ts::scheduleSnapshot` / `drainSnapshots`) so
 *      slow Mongo never blocks the 500ms pulse cadence.
 *
 *  - `lastKnownAggregate(asset)`:
 *      Read the persisted aggregate for an asset. Called exactly
 *      once per asset at `Orchestrator.start()` so the snapshot
 *      controller can answer `/api/snapshot?asset=...` immediately
 *      after a restart — see CLAUDE.md operational quirks:
 *      "Aggregator restart recovers `lastKnownAggregate` per asset
 *      from `AuditPort` and serves it via `/api/snapshot` until the
 *      first new tick arrives."
 *
 * **Async signature.** All four methods are async because the
 * concrete adapter is I/O-bound. The domain proper does not call
 * them directly (CLAUDE.md rule 16 — pure domain); the application
 * layer (orchestrator) is the only caller, and it is comfortable
 * with Promises.
 *
 * Cross-references:
 *  - `infrastructure/mongo-audit.ts`: the concrete adapter and its
 *    fail-safe / duplicate-key / boundary-parse choices.
 *  - `@price-oracle/contracts/events/audit-event.ts`: the
 *    discriminated-union schema this port accepts.
 *  - `application/orchestrator.ts`: the only consumer.
 *  - `decisions.md` Entry 3: why the aggregator has ports/adapters
 *    at all.
 */
import type { AggregatePrice } from '../types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';

export interface AuditPort {
  /**
   * Append one audit event. Implementations must be **fail-safe**:
   * never throw to the caller. The orchestrator's `appendAudit`
   * wrapper still try/catches defensively, but the port contract is
   * that publish-path operations should not fail this call.
   */
  append(event: AuditEvent): Promise<void>;

  /**
   * Most-recent `limit` events, newest first, optionally filtered
   * by asset. Implementations should validate documents at the
   * boundary (CLAUDE.md rule 5) and silently skip any that fail —
   * a corrupted historical document should not break a live audit
   * query.
   */
  recent(limit: number, asset?: AssetId): Promise<readonly AuditEvent[]>;

  /**
   * Upsert the latest aggregate for `aggregate.asset`. One row per
   * asset; subsequent calls replace the existing row.
   */
  recordAggregate(aggregate: AggregatePrice): Promise<void>;

  /**
   * Read the persisted aggregate for `asset`, or `null` if none has
   * been recorded yet. Used by the orchestrator at startup to
   * pre-fill `runtime.lastAggregate` so the snapshot endpoint serves
   * the last-known value until a fresh tick produces a new one.
   */
  lastKnownAggregate(asset: AssetId): Promise<AggregatePrice | null>;
}

/**
 * DI token. CLAUDE.md operational quirks: `tsx` doesn't emit decorator
 * metadata, so every constructor injection has to spell the token
 * explicitly (`@Inject(AUDIT_PORT)`). Symbol-keyed via
 * `Symbol.for(...)` so accidental duplicate-symbol creation across
 * file boundaries is impossible.
 */
export const AUDIT_PORT = Symbol.for('@price-oracle/aggregator/audit-port');
