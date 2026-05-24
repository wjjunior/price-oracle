/**
 * @file `PublishPort` — the domain's contract for shipping a
 * computed aggregate out of the aggregator.
 *
 * **Hexagonal port.** The orchestrator depends on this interface,
 * not on a NATS client. The concrete adapter
 * (`infrastructure/nats-publisher.ts`) implements it on top of
 * `@nats-io/nats-core`, publishing to the `aggregatesSubject(asset)`
 * subject defined in `@price-oracle/contracts/subjects`. Swapping
 * NATS for any other bus is a new adapter, not a domain change.
 *
 * **The contract is one method.** `publishAggregate(aggregate, correlationId)`:
 *  - The aggregate carries `asset` (which scopes the NATS subject —
 *    `aggregates.btc`, `aggregates.eth`), price, confidence,
 *    contributing source list, and `computedAt`.
 *  - The correlation ID is the per-pulse UUID generated in
 *    `orchestrator.ts::pulseAsset`. It is attached to the NATS
 *    message header (`CORRELATION_HEADER`) by the adapter, which is
 *    what carries the lifecycle ID end-to-end through to the SSE
 *    envelope and the dashboard. See CLAUDE.md operational quirks →
 *    "Correlation IDs propagate end-to-end."
 *
 * **Why `Promise<void>`, not a delivery acknowledgement.** This
 * codebase uses NATS Core (`decisions.md` Entry 2), not JetStream:
 * pub/sub semantics, no broker-side persistence, no consumer ack.
 * The promise resolves once the publish call returns on the local
 * client, and that is sufficient for the aggregator's purposes — the
 * tick is ephemeral, and the next pulse will publish a fresh one
 * anyway. Failures get logged at `warn` by the adapter and never
 * surface to the orchestrator's hot path.
 *
 * Cross-references:
 *  - `infrastructure/nats-publisher.ts`: the adapter.
 *  - `@price-oracle/contracts/subjects.ts`: the subject builder
 *    (`aggregatesSubject(asset)`) and the `CORRELATION_HEADER`
 *    constant.
 *  - `decisions.md` Entry 2 (NATS Core, not JetStream).
 *  - `application/orchestrator.ts::publishAggregate`: the only caller.
 */
import type { AggregatePrice } from '../types.js';
import type { CorrelationId } from '@price-oracle/contracts/primitives';


export interface PublishPort {
  /**
   * Publish one aggregate. Implementations should never throw —
   * publish failures are recoverable boundary failures (CLAUDE.md
   * rule 20 → `warn`), and the orchestrator also try/catches
   * defensively in `publishAggregate`.
   */
  publishAggregate(aggregate: AggregatePrice, correlationId: CorrelationId): Promise<void>;
}

/**
 * DI token (see note on `AUDIT_PORT` for the `Symbol.for(...)`
 * choice).
 */
export const PUBLISH_PORT = Symbol.for('@price-oracle/aggregator/publish-port');
