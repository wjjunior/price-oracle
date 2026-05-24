/**
 * @file `GET /health` — the simplest controller in the codebase.
 *
 * **What this is for.** A liveness probe surface: Docker / orchestrator
 * health checks, a smoke-test target for `pnpm dev:infra`, and the
 * "is the aggregator up?" indicator in the dashboard's header. The
 * response is intentionally minimal — `status`, `service`,
 * `uptimeMs` — so an external monitor can parse it without
 * understanding the rest of the API.
 *
 * **Process-uptime tracking.** `startedAt = Date.now()` captured at
 * construction. The `uptimeMs` field is "since this controller
 * resolved", which is a few microseconds after process start under
 * NestJS — close enough to process uptime that the difference does
 * not matter operationally.
 *
 * **No correlation ID, no logger.** Health checks are too frequent
 * to log (every Docker probe interval), and an external monitor
 * does not need a correlation ID. Keeping this endpoint silent is
 * deliberate — it should be cheap and unconditional.
 *
 * **No path on `@Controller()`.** The `/health` route is bound by
 * the `@Get('health')` decorator, not a controller-level prefix.
 * This places the endpoint at the root rather than under `/api/...`,
 * matching the convention that liveness probes are not part of the
 * versioned API surface.
 *
 * Cross-references:
 *  - `health.controller.test.ts`: the smoke test that pins the
 *    response shape.
 *  - `infra/docker-compose.yml`: the source of probe configuration
 *    (if present).
 */
import { Controller, Get } from '@nestjs/common';

/**
 * Hand-rolled response type. We do not pull this from
 * `@price-oracle/contracts/rest` because `/health` is not part of
 * the cross-service contract — it is a deployment-tier surface,
 * not a domain surface.
 */
type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'aggregator';
  readonly uptimeMs: number;
};

@Controller()
export class HealthController {
  /**
   * Process-start timestamp. Captured at construction; the controller
   * is instantiated once by NestJS so `startedAt` is effectively
   * process uptime.
   */
  private readonly startedAt = Date.now();

  /**
   * `GET /health`. Always returns 200 with the structured body.
   * `status: 'ok'` is unconditional — the controller being able to
   * respond at all is the liveness signal we care about; deeper
   * readiness (NATS / Mongo connectivity) lives in
   * `lifecycle.service.ts` and would surface as failed boot.
   */
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'aggregator',
      uptimeMs: Date.now() - this.startedAt,
    };
  }
}
