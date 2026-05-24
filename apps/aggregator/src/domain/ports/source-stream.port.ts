/**
 * @file `SourceStreamPort` — the domain's contract for "give me a
 * tap on every incoming tick from any source for any asset."
 *
 * **Hexagonal port.** The orchestrator subscribes to *something*
 * that delivers `Tick` values with their `CorrelationId`. The
 * concrete adapter (`infrastructure/nats-source-stream.ts`)
 * implements this on top of the NATS subscription
 * `ticks.>` (`TICKS_SUBSCRIPTION_PATTERN` in
 * `@price-oracle/contracts/subjects`), parses each frame against
 * `TickSchema`, reads the correlation ID out of the message header,
 * and calls the callback once per valid tick.
 *
 * **The shape (push, not pull).** The orchestrator hands a callback
 * to `subscribe()` and receives an `Unsubscribe` function it can
 * call on shutdown. This is the standard push-based observability
 * pattern — the alternative (orchestrator polls for next tick)
 * would require either a queue here or a `for await` async iterator,
 * neither of which earns its complexity for a "best-effort fan-in"
 * use case.
 *
 * **Correlation ID is part of the contract.** The adapter is
 * required to read the `CORRELATION_HEADER` from the NATS message
 * (set by the ingestor when it published the tick) and pass it
 * through to the orchestrator. The orchestrator binds the ID to its
 * pino child logger for the rest of the tick's lifecycle — that is
 * what makes "grep one correlation ID across all per-service logs"
 * work end-to-end (CLAUDE.md operational quirks → "Correlation IDs
 * propagate end-to-end"). A frame without the header is dropped by
 * the adapter with a `warn` log.
 *
 * Cross-references:
 *  - `infrastructure/nats-source-stream.ts`: the adapter.
 *  - `@price-oracle/contracts/subjects.ts`: the subscription pattern
 *    and the correlation header constant.
 *  - `packages/ingestor-transport/src/nats/nats.service.ts`: the
 *    other end of the wire (publish side, used by every ingestor).
 *  - `application/orchestrator.ts::start` / `routeTick`: the only
 *    caller.
 */
import type { Tick } from '../types.js';
import type { CorrelationId } from '@price-oracle/contracts/primitives';


/**
 * Returned by `subscribe()`. Calling it terminates the subscription;
 * idempotent in practice (the NATS subscription's own `unsubscribe`
 * is safe to call twice). The orchestrator stores this in
 * `this.unsubscribe` and invokes it on `stop()`.
 */
export type Unsubscribe = () => void;

/**
 * Subscribe to the firehose of ticks. Adapter calls the callback
 * once per validated `Tick`, with the upstream correlation ID. The
 * orchestrator routes each tick into the correct per-asset runtime
 * via `routeTick`.
 */
export interface SourceStreamPort {
  subscribe(onTick: (tick: Tick, correlationId: CorrelationId) => void): Unsubscribe;
}

/**
 * DI token (see note on `AUDIT_PORT` for the `Symbol.for(...)`
 * choice).
 */
export const SOURCE_STREAM_PORT = Symbol.for('@price-oracle/aggregator/source-stream-port');
