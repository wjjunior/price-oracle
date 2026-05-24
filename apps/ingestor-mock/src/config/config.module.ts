/**
 * @file NestJS module that exposes the parsed env config as an
 * injectable provider, keyed by the `INGESTOR_CONFIG` symbol.
 *
 * **Distinct from the Binance/Coinbase config modules.** Compare
 * `apps/ingestor-binance/src/config/config.module.ts`: that file uses
 * `useFactory: () => loadIngestorConfig()`, so the env parse runs at
 * module *instantiation* (inside the DI container's lifecycle). The
 * mock parses *once* in `main.ts` and passes the resulting
 * `IngestorConfig` to `AppModule.register(...)` to `ConfigModule.register(...)`
 * via `useValue`. The difference matters in two places:
 *
 *  1. **Single read of `process.env`.** The mock's `main.ts` calls
 *     `loadIngestorConfig()` exactly once at boot; everything
 *     downstream (the admin gate, the tick generator, the NATS
 *     module) receives the same already-validated object. CLAUDE.md
 *     rule 11: "`process.env` only in the config module" — and here
 *     it is only in `main.ts` even within that module.
 *
 *  2. **Admin-gate decision happens before DI builds.** The
 *     `config.adminEnabled` flag is read in `AppModule.register(...)`
 *     to call `AdminModule.register(config.adminEnabled)`. If we
 *     parsed inside the DI factory, the admin gate would have nothing
 *     to read at module-construction time — the dynamic module would
 *     either need a different shape or we'd be back to a runtime
 *     guard inside the controller, which is the posture we wanted to
 *     avoid (see `admin/admin.module.ts` for why).
 *
 * Marked `@Global()` so every feature module can inject
 * `INGESTOR_CONFIG` without importing `ConfigModule` explicitly.
 * Config is genuinely cross-cutting in this app — the tick generator
 * needs the anchor and volatility, the NATS module needs the URL,
 * the admin controller needs the anchor for the stale-fallback path,
 * the bootstrap needs the HTTP port. The usual "no god modules"
 * guidance gives way here to avoiding boilerplate import lists.
 *
 * See `env.schema.ts` for the parse, the `INGESTOR_CONFIG` token,
 * and the env-var-to-field mapping.
 */
import { Global, Module, type DynamicModule } from '@nestjs/common';

import { INGESTOR_CONFIG, type IngestorConfig } from './env.schema.js';

@Global()
@Module({})
export class ConfigModule {
  /**
   * Wrap a pre-parsed `IngestorConfig` in a Nest provider keyed by
   * `INGESTOR_CONFIG`. Called once from `AppModule.register(...)`.
   *
   * Uses `useValue` (not `useFactory`) because the config object is
   * already in memory by the time we get here — `main.ts` parsed it
   * before constructing the Nest application. See file header for
   * why the parse lives in `main.ts` for the mock.
   */
  static register(config: IngestorConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: INGESTOR_CONFIG, useValue: config }],
      exports: [INGESTOR_CONFIG],
    };
  }
}
