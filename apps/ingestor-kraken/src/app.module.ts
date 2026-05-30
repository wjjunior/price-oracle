import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module.js';
import { KrakenModule } from './kraken/kraken.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        base: { service: 'ingestor-kraken' },
        formatters: { level: (label) => ({ level: label }) },
        timestamp: () => `,"time":${Date.now()}`,
      },
    }),
    ConfigModule,
    NatsModule,
    KrakenModule,
  ],
})
export class AppModule {}
