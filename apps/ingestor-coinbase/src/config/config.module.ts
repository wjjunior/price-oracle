/**
 * @file NestJS module that exposes the parsed env config as an
 * injectable provider.
 *
 * Marked `@Global()` so every feature module (today: `CoinbaseModule`,
 * `NatsModule`) can inject `INGESTOR_CONFIG` without importing
 * `ConfigModule` explicitly. Config is genuinely cross-cutting — every
 * service needs the broker URL or the exchange URL or both — so the
 * usual "no god modules" guidance gives way to the practical benefit
 * of avoiding boilerplate import lists.
 *
 * The provider uses `useFactory: () => loadIngestorConfig()` rather
 * than `useValue: loadIngestorConfig()` so the parse (and its
 * potential Zod throw) runs during module instantiation, not during
 * module *evaluation*. That keeps unit tests of this module file
 * importable without `process.env` being set.
 *
 * See `env.schema.ts` for the parse itself and the `INGESTOR_CONFIG`
 * token, and `coinbase/coinbase.service.ts` for a representative
 * consumer. The sibling `apps/ingestor-binance/src/config/config.module.ts`
 * has an identical shape.
 */
import { Global, Module } from '@nestjs/common';

import { INGESTOR_CONFIG, loadIngestorConfig } from './env.schema.js';

@Global()
@Module({
  providers: [
    {
      provide: INGESTOR_CONFIG,
      useFactory: () => loadIngestorConfig(),
    },
  ],
  exports: [INGESTOR_CONFIG],
})
export class ConfigModule {}
