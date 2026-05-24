/**
 * @file `GET /health` endpoint — the docker healthcheck surface.
 *
 * **Why the mock has this and the real ingestors don't.** Added in
 * PRO-60 alongside the docker-compose healthcheck wiring. The mock
 * already has an HTTP server up (for the conditionally-mounted
 * chaos admin API), so exposing `/health` on the same port costs
 * essentially nothing. The real ingestors
 * (`apps/ingestor-binance/`, `apps/ingestor-coinbase/`) bootstrap
 * as headless Nest application contexts — no HTTP server at all —
 * so adding a healthcheck there would mean standing up an entire
 * server just for one endpoint, which is not free.
 *
 * **Response shape.**
 *
 *   { status: 'ok', service: 'ingestor-mock', uptimeMs: 12345 }
 *
 *  - `status: 'ok'` is a literal type, so the response shape is
 *    closed: anything other than `'ok'` would not compile. We do not
 *    expose a degraded variant today — the mock has no upstream
 *    dependency that could put it in a degraded state. If we needed
 *    that later (e.g. "is NATS reachable?"), the literal would widen
 *    to `'ok' | 'degraded'` and the controller would gain a probe.
 *  - `service: 'ingestor-mock'` mirrors the `service` field bound on
 *    every pino log line — same identity wherever it appears.
 *  - `uptimeMs` is computed from the `startedAt` timestamp captured
 *    in the field initializer. NestJS instantiates the controller
 *    once (default singleton scope), so `startedAt` is genuinely
 *    "when the mock booted", not "when the most recent /health
 *    request arrived".
 *
 * **Why HTTP 200 with `status: 'ok'` rather than 503 for failure.**
 * Today the endpoint always returns 200 (no failure path), so the
 * docker healthcheck reads `status` from the body, not the HTTP
 * code. That keeps room to introduce degraded-but-still-up states
 * without breaking the contract — switching to 503-on-degraded
 * later would silently re-trigger docker's restart policy, which is
 * a different operational decision.
 */
import { Controller, Get } from '@nestjs/common';

/**
 * Closed response shape — every field is a `readonly` literal where
 * possible. Anything not on this type would be a compile error in
 * the controller below, so the wire shape cannot drift.
 */
type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'ingestor-mock';
  readonly uptimeMs: number;
};

@Controller()
export class HealthController {
  // Captured at controller instantiation. Nest's default singleton
  // scope means this is "when the mock booted".
  private readonly startedAt = Date.now();

  /**
   * Handle a healthcheck. Always returns 200 / `status: 'ok'` today.
   * `uptimeMs` is the wall-clock difference from boot to now.
   */
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'ingestor-mock',
      uptimeMs: Date.now() - this.startedAt,
    };
  }
}
