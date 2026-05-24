/**
 * @file Root NestJS module for the Binance ingestor app.
 *
 * Composition root for the thin-NestJS-module flavor of this service.
 * Unlike the aggregator, the ingestor has no hexagonal `domain /
 * application / infrastructure / interface` split — see the
 * `decisions.md` entry on "Hexagonal hybrid": ingestors are protocol
 * adapters with no domain reasoning of their own, so the ceremony of
 * ports and use-cases would be pure overhead.
 *
 * Three concerns wired here:
 *
 *  1. **Structured logging.** `nestjs-pino`'s `LoggerModule.forRoot`
 *     installs a single shared pino logger that every `@Inject(PinoLogger)`
 *     resolves against. The `base` adds `service: 'ingestor-binance'`
 *     to every line so the operator can filter on it across the
 *     three ingestors' logs. The `level` formatter writes the level
 *     name (`info`, `warn`, ...) rather than the numeric value pino
 *     emits by default, which the dashboard's log tail expects.
 *     `timestamp` writes millis since epoch — the same unit used by
 *     the `Millis` primitive in `@price-oracle/contracts`.
 *
 *  2. **Configuration.** `ConfigModule` is `@Global()` so every
 *     feature module can inject `INGESTOR_CONFIG` without importing
 *     it. See `config/config.module.ts`.
 *
 *  3. **Feature modules.** `NatsModule` owns the bus connection,
 *     `BinanceModule` owns the WebSocket and the parse/publish loop.
 *     `BinanceModule` itself imports `NatsModule` so it can inject
 *     `NatsService` directly; listing `NatsModule` here too keeps the
 *     module graph explicit (and means `pnpm test` style integration
 *     tests can bootstrap just `NatsModule` if they want).
 *
 * The sibling Coinbase and mock ingestors compose the same way — the
 * only difference is which feature module owns the upstream feed.
 */
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
