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

const SERVICE_NAME = 'aggregator';

const sharedLogger = pino({
  base: { service: SERVICE_NAME },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: () => `,"time":${Date.now()}`,
});

@Global()
@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { logger: sharedLogger } })],
  controllers: [SnapshotController, AuditController, DiagnoseController, StreamController],
  providers: [
    AssetParamPipe,
    OptionalAssetParamPipe,
    AuditLimitPipe,
    DiagnoseBodyPipe,
    {
      provide: AGGREGATOR_CONFIG,
      useFactory: (): AggregatorConfig => loadAggregatorConfig(process.env),
    },
    {
      provide: LOGGER,
      useValue: sharedLogger,
    },
    {
      provide: NATS_CONNECTION,
      useFactory: (cfg: AggregatorConfig): Promise<NatsConnection> =>
        connect({ servers: cfg.natsUrl }),
      inject: [AGGREGATOR_CONFIG],
    },
    {
      provide: MONGO_CLIENT,
      useFactory: async (cfg: AggregatorConfig): Promise<MongoClientType> => {
        const client = new MongoClient(cfg.mongoUrl);
        await client.connect();
        return client;
      },
      inject: [AGGREGATOR_CONFIG],
    },
    {
      provide: MONGO_DB,
      useFactory: (client: MongoClientType): Db => client.db(),
      inject: [MONGO_CLIENT],
    },
    {
      provide: SOURCE_STREAM_PORT,
      useFactory: (connection: NatsConnection, logger: Logger): SourceStreamPort =>
        new NatsSourceStream(connection, logger),
      inject: [NATS_CONNECTION, LOGGER],
    },
    {
      provide: PUBLISH_PORT,
      useFactory: (connection: NatsConnection, logger: Logger): PublishPort =>
        new NatsPublisher(connection, logger),
      inject: [NATS_CONNECTION, LOGGER],
    },
    {
      provide: AUDIT_PORT,
      useFactory: async (db: Db, logger: Logger): Promise<AuditPort> => {
        const audit = new MongoAudit(db, logger);
        await audit.ensureIndexes();
        return audit;
      },
      inject: [MONGO_DB, LOGGER],
    },
    {
      provide: DIAGNOSE_PORT,
      useFactory: (cfg: AggregatorConfig): DiagnosePort =>
        createDiagnosePort(cfg.anthropicApiKey === undefined ? {} : { apiKey: cfg.anthropicApiKey }),
      inject: [AGGREGATOR_CONFIG],
    },
    {
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
    LifecycleService,
  ],
  exports: [AGGREGATOR_CONFIG, LOGGER, Orchestrator],
})
export class AppModule {}
