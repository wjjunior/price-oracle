/**
 * @file Process entry point for the mock ingestor.
 *
 * **Distinct from the real ingestors' entry points.** Compare with
 * `apps/ingestor-binance/src/main.ts`: that file uses
 * `NestFactory.createApplicationContext(...)` because the Binance
 * ingestor has no HTTP surface (it only owns an outbound WebSocket
 * to Binance and an outbound NATS connection). The mock, in contrast,
 * uses `NestFactory.create(...)` because it has two HTTP surfaces:
 *
 *  - `GET /health` — always on, used by the docker healthcheck (added
 *    in PRO-60).
 *  - `POST /admin/...` — the chaos surface, gated behind
 *    `MOCK_ADMIN_ENABLED=true` (default `false` since PRO-54).
 *
 * `app.listen(config.httpPort)` opens the HTTP listener on
 * `MOCK_HTTP_PORT` (default 7401 — chosen well outside common ranges
 * so it does not collide with the dashboard or the aggregator).
 *
 * **Bootstrap shape.** Three responsibilities:
 *
 *  1. **Parse the env.** `loadIngestorConfig()` runs the Zod schema
 *     in `config/env.schema.ts` against `process.env` — the only
 *     `process.env` read in the entire app (CLAUDE.md rule 11). A
 *     missing or invalid var throws, falls through to the bottom
 *     try/catch, and the process exits with a structured JSON log
 *     line that the operator can grep for the hint.
 *
 *  2. **Build and start Nest.** `AppModule.register(config)` is the
 *     composition root; `bufferLogs: true` defers Nest's startup logs
 *     until `app.useLogger(...)` swaps in pino. `abortOnError: false`
 *     surfaces a Zod env-parse failure as a thrown rejection rather
 *     than a silent `process.exit(1)`, which is easier to debug
 *     locally.
 *
 *  3. **Wire SIGINT/SIGTERM to a graceful shutdown.** `app.close()`
 *     runs every module's `onModuleDestroy` — for this app that means
 *     `TickGeneratorService` clears its `setInterval` and
 *     `NatsService` drains in-flight publishes. The `shutdownPromise`
 *     guard makes the handler idempotent (a double Ctrl-C does not
 *     race two `app.close()` calls). Exit code 130 on SIGINT follows
 *     the POSIX "128 + signal" convention so shell scripts can
 *     distinguish operator-aborted from clean exit.
 *
 * **The bottom try/catch.** Bootstrap errors (notably: a Zod env
 * validation failure or a NATS connection error on first publish)
 * land here. We log a structured JSON line *manually* via
 * `console.error` (not pino, because if `bootstrap` threw we may
 * never have wired pino up) and exit 1. The `hint` field is a small
 * UX touch: the most common cause of a bootstrap failure on a fresh
 * checkout is forgetting to run `pnpm dev:infra` for local NATS, so
 * we say so.
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { loadIngestorConfig } from './config/env.schema.js';

/**
 * Bootstrap the Nest app: parse env, build module, start HTTP
 * listener, and register shutdown handlers. Returns once the
 * listener is up; the process is then kept alive by Nest's open
 * handles (timers, sockets) until a signal arrives.
 */
async function bootstrap(): Promise<void> {
  const config = loadIngestorConfig();
  const app = await NestFactory.create(AppModule.register(config), {
    // Defer Nest's own startup logs until pino is wired (next line).
    bufferLogs: true,
    // Surface env-parse failures as thrown rejections, not silent
    // exits — easier to debug locally.
    abortOnError: false,
  });
  // Replace the default Nest logger with pino so the Nest internals
  // share the same structured output (and `service: 'ingestor-mock'`
  // base field) as the rest of the app.
  app.useLogger(app.get(Logger));
  await app.listen(config.httpPort);

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: NodeJS.Signals): void => {
    // Idempotency guard: a second signal while shutdown is in flight
    // (impatient Ctrl-C twice) must not race a second `app.close()`.
    if (shutdownPromise !== undefined) return;
    shutdownPromise = (async () => {
      try {
        await app.close();
      } finally {
        // SIGINT → 130 by POSIX convention (128 + signal number).
        // Any other signal we handle here is treated as a clean exit
        // so process supervisors don't restart us.
        process.exit(signal === 'SIGINT' ? 130 : 0);
      }
    })();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

try {
  await bootstrap();
} catch (err: unknown) {
  // Bootstrap failed before pino was wired (or `bootstrap` itself
  // threw). Emit a single structured JSON line via raw `console.error`
  // so the format matches the rest of the app's logs as closely as
  // possible, then exit 1. The `hint` is a small UX touch for the
  // most common failure mode on a fresh checkout.
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      level: 'fatal',
      service: 'ingestor-mock',
      event: 'bootstrap.failed',
      message,
      hint: 'If this is a NATS connection error, ensure `pnpm dev:infra` is running.',
    }),
  );
  process.exit(1);
}
