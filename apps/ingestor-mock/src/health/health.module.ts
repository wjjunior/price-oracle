/**
 * @file NestJS module that mounts the `GET /health` controller.
 *
 * Trivial wrapper — exists so the healthcheck can be added or removed
 * with a single line in `app.module.ts` rather than touching the
 * controller registration directly. See `health.controller.ts` for
 * why the mock has a healthcheck and the real ingestors don't
 * (PRO-60: docker healthcheck wiring, and the mock already runs an
 * HTTP server for the conditionally-mounted admin API).
 */
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
