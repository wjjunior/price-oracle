/**
 * @file NATS adapter for `SourceStreamPort` — the aggregator's tick
 * ingress.
 *
 * **What this is.** Subscribes to the broker on
 * `TICKS_SUBSCRIPTION_PATTERN` (`ticks.>` — every tick from every
 * source for every asset), validates each frame against `TickSchema`,
 * extracts the correlation ID from the message header, and pushes
 * `(tick, correlationId)` into the orchestrator via the callback
 * provided to `subscribe()`.
 *
 * **Boundary validation is the contract here (CLAUDE.md rule 5).**
 * Three drop-with-warn paths, in order:
 *
 *   1. **Missing correlation header**. The ingestor side
 *      (`packages/ingestor-transport/src/nats/nats.service.ts`)
 *      attaches `CORRELATION_HEADER` on every publish. A tick
 *      without one would mean either (a) a non-conforming publisher
 *      on the same subject, or (b) a header propagation bug. Either
 *      way, we cannot reconstruct the tick's lifecycle without the
 *      ID — drop it loudly. CLAUDE.md operational quirks:
 *      "Correlation IDs propagate end-to-end."
 *
 *   2. **Non-JSON payload**. The mock ingestor's `MALFORMED` chaos
 *      mode deliberately publishes non-conforming bodies (see
 *      `apps/ingestor-mock/src/mock/chaos-mode.ts`); this branch is
 *      what the mode is *designed to exercise*. We log a truncated
 *      sample of the payload (256 chars) and continue.
 *
 *   3. **Schema-invalid JSON**. Body parses as JSON but fails
 *      `TickSchema`. Same handling: `warn` with the Zod issue list
 *      and a truncated payload, then drop.
 *
 * **Correlation ID is the orchestrator's responsibility from here.**
 * Once `onTick(tick, correlationId)` is called, the ID flows through
 * the orchestrator's per-tick / per-pulse logs and out the SSE
 * envelope. This adapter does not bind it to a child logger because
 * the call is synchronous — the orchestrator does that binding
 * downstream where the scope is right.
 *
 * **Why `MAX_LOGGED_PAYLOAD = 256`.** Pino log lines get expensive
 * past a few KB, and the head of a malformed payload is where the
 * offending field almost always lives. Same convention as the
 * ingestor's `PAYLOAD_TRUNCATE_LENGTH`.
 *
 * **No connection lifecycle here.** Same as `nats-publisher.ts`: the
 * DI factory in `app.module.ts` owns the shared `NatsConnection`,
 * passes it in pre-connected, and tears it down in
 * `lifecycle.service.ts::onApplicationShutdown` via `nats.drain()`.
 *
 * Cross-references:
 *  - `domain/ports/source-stream.port.ts`: the port contract.
 *  - `@price-oracle/contracts/subjects.ts`: `TICKS_SUBSCRIPTION_PATTERN`,
 *    `CORRELATION_HEADER`.
 *  - `@price-oracle/contracts/events/tick.ts`: `TickSchema`.
 *  - `apps/ingestor-mock/src/mock/chaos-mode.ts`: the MALFORMED mode
 *    that exercises the third drop path.
 */
import { TickSchema } from '@price-oracle/contracts/events';
import { CORRELATION_HEADER, TICKS_SUBSCRIPTION_PATTERN } from '@price-oracle/contracts/subjects';


import type { SourceStreamPort, Unsubscribe } from '../domain/ports/source-stream.port.js';
import type { Tick } from '../domain/types.js';
import type { NatsConnection } from '@nats-io/nats-core';
import type { Logger } from 'pino';

/**
 * Hard cap on payload length we include in `warn` logs after a drop.
 * The head of a malformed body is usually where the offending field
 * lives, and full pino lines get expensive past a few KB.
 */
const MAX_LOGGED_PAYLOAD = 256;

export class NatsSourceStream implements SourceStreamPort {
  /**
   * Single decoder reused across messages — `TextDecoder` allocates
   * once and is allocation-free to reuse. Same pattern as the
   * publisher's `TextEncoder`.
   */
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly connection: NatsConnection,
    private readonly logger: Logger,
  ) {}

  /**
   * Open the NATS subscription and route each validated frame to
   * `onTick`. Returns an `Unsubscribe` the orchestrator stores and
   * calls on `stop()`.
   *
   * The callback shape (rather than an async iterator) matches the
   * `@nats-io/nats-core` API — the `callback:` option delivers
   * messages eagerly without backpressure, which is what we want for
   * a "lossy by design" tick stream (`decisions.md` Entry 2).
   */
  subscribe(onTick: (tick: Tick, correlationId: string) => void): Unsubscribe {
    const subscription = this.connection.subscribe(TICKS_SUBSCRIPTION_PATTERN, {
      callback: (err, msg) => {
        if (err !== null) {
          // Subscription-level error (not a per-message problem) —
          // e.g. the broker terminated the subscription. Log and
          // continue; the NATS client will reconnect automatically
          // and re-establish the subscription.
          this.logger.warn(
            { event: 'source-stream.error', error: err.message },
            'NATS subscription error',
          );
          return;
        }
        // Drop 1: missing correlation header. See file header — we
        // cannot reconstruct the lifecycle without the ID.
        const correlationId = msg.headers?.get(CORRELATION_HEADER);
        if (!correlationId) {
          this.logger.warn(
            { event: 'source-stream.missing-correlation', subject: msg.subject },
            'Dropping tick without a correlation id',
          );
          return;
        }
        const tick = this.parseTick(this.decoder.decode(msg.data), correlationId);
        if (tick === null) return;
        onTick(tick, correlationId);
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Parse one frame body into a contract `Tick`. Two drop paths
   * (#2 and #3 from the file header):
   *
   *  - Non-JSON body → `source-stream.malformed` warn.
   *  - JSON parses but fails `TickSchema` → `source-stream.invalid`
   *    warn with the Zod issue list.
   *
   * Both paths return `null`; the caller above translates `null`
   * into "skip this message, do not invoke onTick".
   */
  private parseTick(raw: string, correlationId: string): Tick | null {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.logger.warn(
        { event: 'source-stream.malformed', correlationId, payload: raw.slice(0, MAX_LOGGED_PAYLOAD) },
        'Dropping non-JSON tick payload',
      );
      return null;
    }
    // Boundary parse: from here on, `result.data` is fully typed and
    // can be trusted across the orchestrator (CLAUDE.md rule 5).
    const result = TickSchema.safeParse(json);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'source-stream.invalid',
          correlationId,
          payload: raw.slice(0, MAX_LOGGED_PAYLOAD),
          issues: result.error.issues,
        },
        'Dropping tick that failed contract validation',
      );
      return null;
    }
    return result.data;
  }
}
