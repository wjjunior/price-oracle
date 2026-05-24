/**
 * @file Process entry point for the Coinbase ingestor.
 *
 * Mirror image of `apps/ingestor-binance/src/main.ts` — if you have
 * already read that file's header, this one says the same things with
 * "Coinbase" substituted for "Binance". The three concerns:
 *
 *  1. **Bootstrap a headless Nest application.** We use
 *     `createApplicationContext` (not `NestFactory.create`) because
 *     the ingestor has no HTTP surface — it owns an outbound
 *     WebSocket to Coinbase Advanced Trade and an outbound NATS
 *     connection, but it never accepts inbound requests. Real
 *     ingestors are **observation-only**: they have no admin/chaos
 *     endpoints. That is the deliberate split documented in CLAUDE.md's
 *     "Mock ingestor admin API is dev-only" operational quirk — only
 *     the mock can have its failures injected synthetically; Binance
 *     and Coinbase failures are observed in the field.
 *
 *  2. **Install the pino logger as the Nest logger.** Until this swap,
 *     Nest buffers its own startup logs (`bufferLogs: true`); after
 *     `app.useLogger(...)`, every Nest internal log line goes through
 *     pino with the `service: 'ingestor-coinbase'` base field attached
 *     (see `app.module.ts`). `abortOnError: false` lets the bootstrap
 *     surface a Zod env-config validation error as a thrown rejection
 *     from `createApplicationContext` rather than a silent
 *     `process.exit(1)` — easier to debug locally.
 *
 *  3. **Wire SIGINT/SIGTERM to a graceful shutdown.** `app.close()`
 *     runs each module's `onModuleDestroy`, which lets `CoinbaseService`
 *     cancel its reconnect timer and tear down the WebSocket, and
 *     `NatsService` drain in-flight publishes (see
 *     `@price-oracle/ingestor-transport/nats`). The `shutdownPromise`
 *     guard makes the handler idempotent — a double Ctrl-C (common
 *     during local dev) does not race two `app.close()` calls.
 *     Exit code 130 on SIGINT follows the POSIX "128 + signal"
 *     convention so shell scripts can distinguish operator-aborted
 *     from clean exit.
 *
 * `import 'reflect-metadata'` at the very top is required by NestJS's
 * decorators. Note the CLAUDE.md operational quirk: even with this
 * import, `tsx` does not emit TypeScript's `design:paramtypes`
 * metadata, which is why every constructor parameter in this app uses
 * an explicit `@Inject(...)` token.
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  bufferLogs: true,
  abortOnError: false,
});
app.useLogger(app.get(Logger));
app.enableShutdownHooks();

let shutdownPromise: Promise<void> | undefined;

const shutdown = (signal: NodeJS.Signals): void => {
  // Idempotency guard: a second signal while shutdown is in flight
  // (e.g. impatient Ctrl-C twice) must not race a second `app.close()`.
  if (shutdownPromise !== undefined) return;
  shutdownPromise = (async () => {
    try {
      await app.close();
    } finally {
      // SIGINT → 130 by POSIX convention (128 + signal number). Any
      // other signal we handle here is treated as a clean exit so
      // process supervisors don't restart us.
      process.exit(signal === 'SIGINT' ? 130 : 0);
    }
  })();
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
