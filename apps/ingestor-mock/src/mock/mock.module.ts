/**
 * @file NestJS feature module that wires the chaos/tick subsystem.
 *
 * Bundles the two providers that together make up the mock's
 * tick-publishing behavior:
 *
 *  - `ChaosStateService` — per-asset chaos state (the only mutable
 *    runtime state in the app).
 *  - `TickGeneratorService` — the per-interval emitter that reads the
 *    chaos state and dispatches to the right publish path.
 *
 * Both are exported so they can be re-injected by `AdminModule` (the
 * admin controller needs to mutate the state and read
 * `TickGeneratorService.lastPublished` when freezing an asset to
 * STALE). `AdminModule` imports `MockModule` rather than re-declaring
 * these providers, which keeps them as singletons — registering a
 * provider in two modules without re-using the source module gives
 * you two instances and silently breaks the "single source of truth"
 * shape of the chaos state.
 *
 * Imports `NatsModule` so the tick generator can resolve the shared
 * `NatsService` adapter (see `../nats/nats.module.ts`).
 */
import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { ChaosStateService } from './chaos-state.service.js';
import { TickGeneratorService } from './tick-generator.service.js';

@Module({
  imports: [NatsModule],
  providers: [ChaosStateService, TickGeneratorService],
  exports: [ChaosStateService, TickGeneratorService],
})
export class MockModule {}
