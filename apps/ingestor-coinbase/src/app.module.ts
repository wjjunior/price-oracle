import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { CoinbaseModule } from './coinbase/coinbase.module.js';
import { ConfigModule } from './config/config.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        base: { service: 'ingestor-coinbase' },
        formatters: { level: (label) => ({ level: label }) },
        timestamp: () => `,"time":${Date.now()}`,
      },
    }),
    ConfigModule,
    NatsModule,
    CoinbaseModule,
  ],
})
export class AppModule {}
