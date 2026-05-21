import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AdminModule } from './admin/admin.module.js';
import { ConfigModule } from './config/config.module.js';
import { INGESTOR_CONFIG, type IngestorConfig } from './config/env.schema.js';
import { MockModule } from './mock/mock.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [INGESTOR_CONFIG],
      useFactory: (cfg: IngestorConfig) => ({
        pinoHttp: {
          level: cfg.LOG_LEVEL,
          base: { service: 'ingestor-mock' },
        },
      }),
    }),
    NatsModule,
    MockModule,
    AdminModule,
  ],
})
export class AppModule {}
