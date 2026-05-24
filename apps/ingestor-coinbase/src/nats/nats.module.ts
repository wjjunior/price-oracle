/**
 * @file NestJS module that wires the shared `NatsService` adapter
 * (from `@price-oracle/ingestor-transport/nats`) into this app's DI
 * container.
 *
 * Why a factory provider rather than a `useClass` registration: the
 * `NatsService` constructor needs two things that NestJS cannot supply
 * by reflection under `tsx`:
 *
 *  1. A `NatsTransportOptions` object built from the app-specific Zod
 *     config (only the `natsUrl` field is needed today, but the
 *     options type leaves room for `name`, `token`, etc. to be added
 *     without a constructor change). We build it inline from the
 *     `INGESTOR_CONFIG` value.
 *
 *  2. An explicit `PinoLogger` instance. The `nestjs-pino`
 *     `LoggerModule.forRoot(...)` registered in `app.module.ts`
 *     exposes `PinoLogger` as a class provider; we forward it
 *     explicitly via `inject: [PinoLogger]` so the transport-package's
 *     class (which is *not* `@Injectable()` — it's a plain TS class so
 *     any host can use it) gets the right logger.
 *
 * The `useFactory` + `inject` pattern is also the documented workaround
 * for the `tsx` decorator-metadata limitation (CLAUDE.md operational
 * quirks): factory injection is name-driven, not type-reflection-driven,
 * so it works regardless of whether `design:paramtypes` is emitted.
 *
 * The sibling Binance ingestor (`apps/ingestor-binance/src/nats/`)
 * uses an identical module — if you change one, change both.
 */
import { Module } from '@nestjs/common';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

@Module({
  providers: [
    {
      provide: NatsService,
      useFactory: (config: IngestorConfig, logger: PinoLogger): NatsService =>
        new NatsService({ natsUrl: config.natsUrl }, logger),
      inject: [INGESTOR_CONFIG, PinoLogger],
    },
  ],
  exports: [NatsService],
})
export class NatsModule {}
