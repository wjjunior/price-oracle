/**
 * @file The mock ingestor's root Nest module — the composition root
 * where every feature module is wired together.
 *
 * **Distinct from the real ingestors.** Binance and Coinbase
 * (`apps/ingestor-binance/src/app.module.ts` and sibling) only mount
 * `ConfigModule`, `NatsModule`, and the exchange-specific feature
 * module. The mock additionally mounts:
 *
 *  - `LoggerModule.forRoot(...)`: a Nest-aware pino logger with
 *    `service: 'ingestor-mock'` baked into every line and an integer
 *    `level` field (so log-aggregation pipelines can filter
 *    numerically). The sibling ingestors do the same; this stays
 *    inline rather than being lifted into a shared package because
 *    each ingestor's `service` value is different.
 *  - `MockModule`: the chaos+tick subsystem (always on — the mock has
 *    nothing to publish without it).
 *  - `AdminModule.register(config.adminEnabled)`: the conditionally-
 *    mounted chaos surface. **This is the only app in the codebase
 *    that ever registers an admin module** — see the `admin.module.ts`
 *    file header and CLAUDE.md operational quirks for the "dev-only"
 *    rationale.
 *  - `HealthModule`: a `GET /health` endpoint for the docker
 *    healthcheck (added in PRO-60). The real ingestors run as
 *    headless Nest application contexts (no HTTP surface), so they
 *    don't need this; the mock already has an HTTP server up for the
 *    admin API, so it costs nothing to expose health on the same
 *    server.
 *
 * **`register(config)` not `forRoot`.** We pass the parsed
 * `IngestorConfig` in from `main.ts` rather than re-reading
 * `process.env` here. CLAUDE.md rule 11: "`process.env` only in the
 * config module." The single read happens in `loadIngestorConfig()`;
 * everything below this line consumes the already-validated value.
 *
 * **Pino timestamp customization.** `timestamp: () => ,"time":${Date.now()}`
 * overrides pino's default (high-resolution `1.5e12` nanoseconds) with
 * an integer milliseconds value, which matches the `Millis`
 * primitive's encoding everywhere else in the system and is what the
 * dashboard's audit-timeline widget expects when correlating log
 * lines with audit events. The leading comma is required by pino's
 * serialization — it gets inlined into the JSON object.
 *
 * Cross-refs:
 *  - `main.ts` — the bootstrap that calls `AppModule.register(...)`.
 *  - `config/env.schema.ts` — the Zod schema that produced the
 *    `IngestorConfig`.
 *  - `admin/admin.module.ts` — the gating logic for the chaos
 *    surface.
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AdminModule } from './admin/admin.module.js';
import { ConfigModule } from './config/config.module.js';
import { type IngestorConfig } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { MockModule } from './mock/mock.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({})
export class AppModule {
  /**
   * Build the root module against an already-parsed `IngestorConfig`.
   *
   * Mounting order does not matter at runtime (Nest builds the DI
   * graph topologically), but reading order matters for humans:
   * cross-cutting (logger, config), transport (NATS), feature
   * (mock tick generator), conditional surface (admin), operational
   * (health). The order in the array below mirrors that reading.
   */
  static register(config: IngestorConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            // Every pino line carries `service: 'ingestor-mock'` so an
            // operator can grep one process's output out of the
            // multiplexed `pnpm dev` stream. CLAUDE.md rule 20: log
            // levels and structured context are a contract.
            base: { service: 'ingestor-mock' },
            // Emit the level as a string label (`info`, `warn`, ...)
            // rather than pino's default numeric code (30, 40, ...).
            // The dashboard and `pino-pretty` both read the label.
            formatters: { level: (label) => ({ level: label }) },
            // Override pino's default high-resolution timestamp to plain
            // milliseconds since epoch — matches the `Millis` primitive
            // in `@price-oracle/contracts/primitives` and lets the
            // audit-timeline widget correlate log lines against audit
            // events without a unit conversion.
            timestamp: () => `,"time":${Date.now()}`,
          },
        }),
        ConfigModule.register(config),
        NatsModule,
        MockModule,
        // The one and only chaos surface in the codebase. Defaults
        // to a no-op empty module unless MOCK_ADMIN_ENABLED=true.
        AdminModule.register(config.adminEnabled),
        HealthModule,
      ],
    };
  }
}
