/**
 * @file `GET /api/stream` — Server-Sent Events fan-out for the
 * dashboard.
 *
 * **The dashboard's live channel.** Every per-asset widget on the
 * dashboard subscribes to this SSE endpoint. The orchestrator emits
 * `SseEnvelope` values via its internal EventEmitter
 * (`onEvent(listener)` registers a listener that the controller
 * pipes into NestJS's `Observable<MessageEvent>` shape).
 *
 * **Three envelope variants travel this stream** (see
 * `@price-oracle/contracts/sse/envelope.ts` for the discriminated
 * union):
 *  - `aggregate`     — a new published aggregate (price, confidence).
 *  - `source-health` — per-source FSM state. Streamed every pulse
 *                      so the "X seconds since last tick" labels
 *                      animate continuously.
 *  - `breaker-state` — on every breaker transition.
 *  - `audit`         — full audit events, mirroring what was written
 *                      to Mongo (for the dashboard's live audit feed).
 *
 * **Correlation IDs propagate via the envelope itself** (CLAUDE.md
 * operational quirks: "Correlation IDs propagate end-to-end... and
 * SSE envelopes (aggregator → dashboard)"). Every envelope carries
 * the per-pulse or per-tick `correlationId` so the dashboard can
 * surface it on the audit timeline and the operator can grep it
 * across services.
 *
 * **Heartbeat every 15 seconds.** A plain `{ type: 'heartbeat',
 * data: '' }` `MessageEvent` keeps the SSE connection alive through
 * proxies (nginx default idle timeout is 60s) and gives the
 * dashboard a "are we still connected?" signal even when there
 * have been no events. `merge(envelopes, heartbeat)` interleaves
 * the two streams without affecting envelope ordering.
 *
 * **Subscription lifecycle.** The Observable's subscribe callback
 * registers the listener on the orchestrator's emitter; the
 * cleanup closure (`return off`) unregisters it. NestJS calls the
 * cleanup when the client disconnects, which prevents the
 * EventEmitter from leaking listeners on a refresh-heavy demo.
 *
 * **`setMaxListeners(0)` in the orchestrator** is why this works for
 * many tabs at once — default cap of 10 would page on a small demo.
 *
 * Cross-references:
 *  - `application/orchestrator.ts::onEvent / emit`: the emitter and
 *    its subscribe API.
 *  - `@price-oracle/contracts/sse/envelope.ts`: the discriminated
 *    union variants.
 *  - `frontend/dashboard/src/shared/api/stream.ts`: the
 *    `EventSource`-based consumer.
 *  - CLAUDE.md operational quirks → correlation propagation.
 */
import { Controller, Inject, type MessageEvent, Sse } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';

import { Orchestrator } from '../application/orchestrator.js';

import type { SseEnvelope } from '@price-oracle/contracts/sse';

/**
 * Heartbeat cadence. 15s comfortably beats the typical 60s proxy
 * idle timeout (nginx default) while not adding noticeable noise.
 */
const HEARTBEAT_MS = 15_000;
/**
 * Heartbeat envelope `type` field. The dashboard ignores it; the
 * point is the bytes on the wire keeping the connection warm.
 */
const HEARTBEAT_TYPE = 'heartbeat';

@Controller('api')
export class StreamController {
  constructor(@Inject(Orchestrator) private readonly orchestrator: Orchestrator) {}

  /**
   * Open the SSE stream. NestJS's `@Sse(...)` decorator turns the
   * returned `Observable<MessageEvent>` into a streaming HTTP
   * response with the right `Content-Type: text/event-stream`
   * headers.
   *
   * Two RxJS observables merged:
   *  - `envelopes`: hot stream of orchestrator events. Subscribing
   *    registers a listener via `orchestrator.onEvent(...)`; the
   *    cleanup returned from `onEvent` is itself the Observable's
   *    teardown callback.
   *  - `heartbeat`: cold ticking emitter at `HEARTBEAT_MS` cadence.
   *
   * `merge(...)` interleaves; envelope ordering is preserved per
   * stream, and heartbeat lines just slot in between envelopes.
   */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const envelopes = new Observable<MessageEvent>((subscriber) => {
      const off = this.orchestrator.onEvent((envelope: SseEnvelope) => {
        // The whole envelope is the `data` field. NestJS will
        // JSON-encode it for the wire. The discriminator (`type`)
        // is inside the envelope itself, not in the SSE `event:` line.
        subscriber.next({ data: envelope });
      });
      // Returning the unsubscribe callback wires teardown to client
      // disconnect — see file header on listener-leak prevention.
      return off;
    });
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: HEARTBEAT_TYPE, data: '' })),
    );
    return merge(envelopes, heartbeat);
  }
}
