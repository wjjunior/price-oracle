import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AdminModule } from './admin/admin.module.js';
import { ConfigModule } from './config/config.module.js';
import { MockModule } from './mock/mock.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        base: { service: 'ingestor-mock' },
        formatters: { level: (label) => ({ level: label }) },
        timestamp: () => `,"time":${Date.now()}`,
      },
    }),
    ConfigModule,
    NatsModule,
    MockModule,
    AdminModule,
  ],
})
export class AppModule {}
