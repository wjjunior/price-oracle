import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AdminModule } from './admin/admin.module.js';
import { ConfigModule } from './config/config.module.js';
import { type IngestorConfig } from './config/env.schema.js';
import { MockModule } from './mock/mock.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({})
export class AppModule {
  static register(config: IngestorConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            base: { service: 'ingestor-mock' },
            formatters: { level: (label) => ({ level: label }) },
            timestamp: () => `,"time":${Date.now()}`,
          },
        }),
        ConfigModule.register(config),
        NatsModule,
        MockModule,
        AdminModule.register(config.adminEnabled),
      ],
    };
  }
}
