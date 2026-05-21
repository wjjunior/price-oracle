import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { BinanceModule } from './binance/binance.module.js';
import { ConfigModule } from './config/config.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        base: { service: 'ingestor-binance' },
        formatters: { level: (label) => ({ level: label }) },
        timestamp: () => `,"time":${Date.now()}`,
      },
    }),
    ConfigModule,
    NatsModule,
    BinanceModule,
  ],
})
export class AppModule {}
