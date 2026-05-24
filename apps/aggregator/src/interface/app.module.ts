/**
 * @file NestJS composition root for the aggregator.
 *
 * **The only file in the codebase that touches every layer.** CLAUDE.md
 * hexagonal hybrid: the `interface/` layer is the composition root,
 * the one place where domain ports get bound to infrastructure
 * adapters and HTTP controllers get wired with their dependencies.
 * Everything that follows the dependency rule (`domain` knows nothing
 * about `interface`) ultimately gets stitched together here.
 *
 * **What this module does, in order:**
 *
 *  1. **Creates the shared pino logger** with the service-level
 *     `base: { service: 'aggregator' }` binding. Used both by
 *     `LoggerModule.forRoot` (so HTTP request logs are pino-routed)
 *     and by the explicit `LOGGER` provider (so adapters that don't
 *     go through `nestjs-pino`'s injection get the same instance).
 *
 *  2. **Loads the typed config** via `loadAggregatorConfig(process.env)`.
 *     CLAUDE.md rule 11 — `process.env` is read here and nowhere
 *     else. Every downstream consumer injects the parsed
 *     `AggregatorConfig`.
 *
 *  3. **Opens the shared NATS connection** and the Mongo client.
 *     Connection lifecycle is owned by these DI factories and the
 *     symmetric tear-down in `lifecycle.service.ts`.
 *
 *  4. **Binds each domain port to its infrastructure adapter** —
 *     `SOURCE_STREAM_PORT` → `NatsSourceStream`,
 *     `PUBLISH_PORT`      → `NatsPublisher`,
 *     `AUDIT_PORT`        → `MongoAudit` (also runs `ensureIndexes`),
 *     `DIAGNOSE_PORT`     → `createDiagnosePort(...)` selector. The
 *     diagnose binding is where the **composition-time adapter
 *     choice** happens — `decisions.md` Entry 6: if `apiKey` is
 *     present, real adapter; otherwise the stub. Same code path in
 *     the orchestrator either way.
 *
 *  5. **Constructs the orchestrator** with all four port instances
 *     plus the logger.
 *
 *  6. **Registers controllers** and a handful of pipes. The
 *     `LifecycleService` registers itself as a provider; NestJS calls
 *     its `onApplicationBootstrap` and `onApplicationShutdown` hooks
 *     once the module is wired.
 *
 * **@Global**. The module is global so the providers (especially
 * `LOGGER` and `Orchestrator`) are visible everywhere without
 * re-import. This is acceptable here because there is exactly one
 * module — the aggregator is not split across multiple feature
 * modules.
 *
 * **`useFactory` everywhere.** Most providers are factory-bound
 * rather than class-bound because they either need async setup
 * (Mongo `connect`, audit `ensureIndexes`), parameter-based
 * construction (the diagnose selector), or because they accept
 * unusual constructor shapes (NatsPublisher receives a raw
 * `NatsConnection`, not a wrapper service). The factory shape also
 * sidesteps the `tsx` decorator-metadata limitation (CLAUDE.md
 * operational quirks): factories declare their `inject:` token list
 * explicitly, so there is no type-based resolution to fail silently.
 *
 * Cross-references:
 *  - `decisions.md` Entries 3 (hexagonal hybrid) and 6 (composition-
 *    time diagnose adapter).
 *  - CLAUDE.md operational quirks: NestJS DI under tsx, Mongo off
 *    the hot path, correlation propagation, Anthropic stub fallback.
 *  - `domain/ports/*.port.ts`: the contracts this file binds.
 *  - `infrastructure/*`: the adapters being bound.
 *  - `lifecycle.service.ts`: the symmetric shutdown logic.
 */
import { connect } from '@nats-io/transport-node';
import { Global, Module } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';

import { Orchestrator } from '../application/orchestrator.js';
import { AGGREGATOR_CONFIG, loadAggregatorConfig } from '../config/env.schema.js';
import { AUDIT_PORT } from '../domain/ports/audit.port.js';
import { DIAGNOSE_PORT } from '../domain/ports/diagnose.port.js';
import { PUBLISH_PORT } from '../domain/ports/publish.port.js';
import { SOURCE_STREAM_PORT } from '../domain/ports/source-stream.port.js';
import { createDiagnosePort } from '../infrastructure/diagnose/create-diagnose-port.js';
import { MongoAudit } from '../infrastructure/mongo-audit.js';
import { NatsPublisher } from '../infrastructure/nats-publisher.js';
import { NatsSourceStream } from '../infrastructure/nats-source-stream.js';

import { AssetParamPipe } from './asset-param.pipe.js';
import { AuditLimitPipe } from './audit-limit.pipe.js';
import { AuditController } from './audit.controller.js';
import { DiagnoseBodyPipe } from './diagnose-body.pipe.js';
import { DiagnoseController } from './diagnose.controller.js';
import { HealthController } from './health.controller.js';
import { LifecycleService } from './lifecycle.service.js';
import { OptionalAssetParamPipe } from './optional-asset-param.pipe.js';
import { buildOrchestratorConfig } from './orchestrator.config.js';
import { SnapshotController } from './snapshot.controller.js';
import { StreamController } from './stream.controller.js';
import { LOGGER, MONGO_CLIENT, MONGO_DB, NATS_CONNECTION } from './tokens.js';

import type { AggregatorConfig } from '../config/env.schema.js';
import type { AuditPort } from '../domain/ports/audit.port.js';
import type { DiagnosePort } from '../domain/ports/diagnose.port.js';
import type { PublishPort } from '../domain/ports/publish.port.js';
import type { SourceStreamPort } from '../domain/ports/source-stream.port.js';
import type { NatsConnection } from '@nats-io/nats-core';
import type { Db, MongoClient as MongoClientType } from 'mongodb';
import type { Logger } from 'pino';

/**
 * Service-name binding for every log line. Pino renders it as the
 * `service` field; the dashboard's log filter and `pino-pretty` in
 * dev both group lines by this field.
 */
const SERVICE_NAME = 'aggregator';

/**
 * One pino logger instance, shared by the request middleware
 * (via `LoggerModule.forRoot`) and the rest of the system
 * (via the `LOGGER` provider). The custom `formatters.level` turns
 * pino's numeric level into the string label other tooling expects;
 * the custom `timestamp` emits `,"time":...` directly so we avoid
 * the per-line `new Date().toISOString()` allocation.
 */
const sharedLogger = pino({
  base: { service: SERVICE_NAME },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: () => `,"time":${Date.now()}`,
});

@Global()
@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { logger: sharedLogger } })],
  controllers: [
    HealthController,
    SnapshotController,
    AuditController,
    DiagnoseController,
    StreamController,
  ],
  providers: [
    // Pipes are providers so NestJS can DI-inject them into controller
    // parameters (`@Query('asset', AssetParamPipe) ...`).
    AssetParamPipe,
    OptionalAssetParamPipe,
    AuditLimitPipe,
    DiagnoseBodyPipe,
    {
      // The typed config — loaded from process.env exactly here.
      provide: AGGREGATOR_CONFIG,
      useFactory: (): AggregatorConfig => loadAggregatorConfig(process.env),
    },
    {
      // The shared pino logger as a value provider, for adapters that
      // don't go through nestjs-pino's class injection.
      provide: LOGGER,
      useValue: sharedLogger,
    },
    {
      // NATS connection. The factory awaits the initial TCP/INFO
      // handshake so any downstream code can publish/subscribe
      // immediately after DI resolves.
      provide: NATS_CONNECTION,
      useFactory: (cfg: AggregatorConfig): Promise<NatsConnection> =>
        connect({ servers: cfg.natsUrl }),
      inject: [AGGREGATOR_CONFIG],
    },
    {
      // Mongo client. `ignoreUndefined: true` so optional fields
      // serialize correctly (we never want `undefined` written as
      // `null`).
      provide: MONGO_CLIENT,
      useFactory: async (cfg: AggregatorConfig): Promise<MongoClientType> => {
        const client = new MongoClient(cfg.mongoUrl, { ignoreUndefined: true });
        await client.connect();
        return client;
      },
      inject: [AGGREGATOR_CONFIG],
    },
    {
      // Derived `Db`. Separate token so adapters can inject the
      // narrower `Db`, not the full client.
      provide: MONGO_DB,
      useFactory: (client: MongoClientType): Db => client.db(),
      inject: [MONGO_CLIENT],
    },
    {
      // Port → adapter binding: tick ingress on NATS.
      provide: SOURCE_STREAM_PORT,
      useFactory: (connection: NatsConnection, logger: Logger): SourceStreamPort =>
        new NatsSourceStream(connection, logger),
      inject: [NATS_CONNECTION, LOGGER],
    },
    {
      // Port → adapter binding: aggregate egress on NATS.
      provide: PUBLISH_PORT,
      useFactory: (connection: NatsConnection, logger: Logger): PublishPort =>
        new NatsPublisher(connection, logger),
      inject: [NATS_CONNECTION, LOGGER],
    },
    {
      // Port → adapter binding: durable audit on Mongo. The factory
      // calls `ensureIndexes()` so the uniqueness index is in place
      // before the orchestrator starts emitting events.
      provide: AUDIT_PORT,
      useFactory: async (db: Db, logger: Logger): Promise<AuditPort> => {
        const audit = new MongoAudit(db, logger);
        await audit.ensureIndexes();
        return audit;
      },
      inject: [MONGO_DB, LOGGER],
    },
    {
      // The composition-time diagnose selector. `decisions.md` Entry 6.
      // Conditional spread is what passes the `apiKey` only when
      // present — `cfg.anthropicApiKey === undefined` selects the stub.
      provide: DIAGNOSE_PORT,
      useFactory: (cfg: AggregatorConfig): DiagnosePort =>
        createDiagnosePort(cfg.anthropicApiKey === undefined ? {} : { apiKey: cfg.anthropicApiKey }),
      inject: [AGGREGATOR_CONFIG],
    },
    {
      // The orchestrator itself — pure application layer, only sees
      // ports + logger. `buildOrchestratorConfig()` re-reads env
      // vars for the per-asset/per-source/threshold tuning.
      provide: Orchestrator,
      useFactory: (
        sourceStream: SourceStreamPort,
        publisher: PublishPort,
        audit: AuditPort,
        logger: Logger,
      ): Orchestrator =>
        new Orchestrator(buildOrchestratorConfig(), { sourceStream, publisher, audit, logger }),
      inject: [SOURCE_STREAM_PORT, PUBLISH_PORT, AUDIT_PORT, LOGGER],
    },
    // Owns startup/shutdown of orchestrator + connections.
    LifecycleService,
  ],
  exports: [AGGREGATOR_CONFIG, LOGGER, Orchestrator],
})
export class AppModule {}
