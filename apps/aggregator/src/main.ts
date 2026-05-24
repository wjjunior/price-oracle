/**
 * @file Aggregator entry point — `pnpm --filter @price-oracle/aggregator dev`
 * starts here.
 *
 * **What this file does, in order.**
 *
 *  1. **`import 'reflect-metadata';`** — must be the very first
 *     import. NestJS's DI system depends on `Reflect.metadata(...)`
 *     for class-token resolution; the polyfill must be installed
 *     before any decorator runs. Note that even with this in place,
 *     `tsx` does not emit TypeScript's `design:paramtypes`
 *     metadata, so every constructor still needs explicit `@Inject(...)`
 *     (CLAUDE.md operational quirks). The `reflect-metadata` import
 *     is what makes the *explicit* metadata work, not what would
 *     have made the implicit metadata work.
 *
 *  2. **`NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false })`**.
 *      - `bufferLogs: true` defers log output until `app.useLogger(...)`
 *        is called, so the first lines pino emits use the configured
 *        logger (our service-bound shared pino) rather than NestJS's
 *        own ConsoleLogger.
 *      - `abortOnError: false` keeps the process alive when DI
 *        resolution throws — we want our structured `bootstrap.failed`
 *        log line in the catch block, not NestJS's default unhandled
 *        process exit.
 *
 *  3. **CORS** — bound to `cfg.corsOrigin`. The default in
 *     `env.schema.ts` is `http://localhost:5173`, matching Vite's
 *     default. Production sets this to the dashboard's actual
 *     origin.
 *
 *  4. **Listen** on `cfg.httpPort` (default 7402).
 *
 *  5. **Signal handling**. SIGTERM (container orchestrator) and
 *     SIGINT (Ctrl-C in dev) both route to a single shutdown
 *     closure. The `shutdownPromise` guard makes it idempotent — two
 *     signals in quick succession do not start two shutdowns. Exit
 *     code 130 (`128 + SIGINT`) is the convention for Ctrl-C,
 *     anything else exits 0.
 *
 *     The actual teardown work is in `LifecycleService::onApplicationShutdown`
 *     which `app.close()` invokes. This file only owns the signal
 *     wiring and the exit codes.
 *
 *  6. **Boot-failure logging**. Any error escaping `bootstrap()` (DI
 *     resolution failure, port binding failure, env-schema parse
 *     failure) is caught at the top level and emitted as a JSON
 *     `bootstrap.failed` line on stderr. The `hint` field is for
 *     the reviewer: a fresh clone with `pnpm dev:infra` not yet
 *     running is the most common failure mode, and pointing at it
 *     directly saves them a minute of head-scratching.
 *
 * **Top-level await is used** (`await bootstrap()` outside an async
 * function). This requires `"module": "ES2022"` (or later) and
 * Node 22 — see `.nvmrc` and the root `package.json` `engines`
 * field. The conventional `bootstrap().catch(...)` pattern would
 * work too, but top-level await keeps the `try/catch` shape
 * symmetric with the rest of the codebase.
 *
 * Cross-references:
 *  - `interface/app.module.ts`: the composition root that owns DI
 *    factories.
 *  - `interface/lifecycle.service.ts`: the `onApplicationShutdown`
 *    that `app.close()` invokes.
 *  - `config/env.schema.ts`: `corsOrigin`, `httpPort` defaults.
 *  - CLAUDE.md operational quirks: `reflect-metadata` ordering, tsx
 *    decorator metadata.
 */
import 'reflect-metadata';

import { inspect } from 'node:util';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AGGREGATOR_CONFIG, type AggregatorConfig } from './config/env.schema.js';
import { AppModule } from './interface/app.module.js';

/**
 * Construct, configure, and start the NestJS app. Throws on any
 * boot failure; the top-level `try/catch` below catches and emits
 * the structured `bootstrap.failed` line.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Defer pino output until `useLogger` swaps the default logger.
    bufferLogs: true,
    // Don't let NestJS exit on a DI resolution throw — we want our
    // own catch block to log it.
    abortOnError: false,
  });
  // Replace the default ConsoleLogger with our pino logger. This is
  // what flushes the buffered boot lines into pino's structured
  // format.
  app.useLogger(app.get(Logger));
  const cfg = app.get<AggregatorConfig>(AGGREGATOR_CONFIG);
  app.enableCors({ origin: cfg.corsOrigin });
  await app.listen(cfg.httpPort);

  // Idempotent shutdown closure. The `shutdownPromise` guard makes
  // double-signals (Ctrl-C twice) safe.
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shutdownPromise !== undefined) return;
    shutdownPromise = (async () => {
      try {
        // Triggers `LifecycleService::onApplicationShutdown`.
        await app.close();
      } finally {
        // 128 + SIGINT(2) = 130 — the conventional Ctrl-C exit code.
        // Anything else (SIGTERM mostly) exits 0.
        process.exit(signal === 'SIGINT' ? 130 : 0);
      }
    })();
  };
  // `once` rather than `on` — we never want the signal to fire the
  // closure twice; the guard handles it but `once` is the cleaner
  // contract.
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

try {
  // Top-level await — requires ES2022 + Node 22. See file header.
  await bootstrap();
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : inspect(err);
  // Structured one-liner on stderr. The `hint` field saves a
  // reviewer time on the most common dev-environment failure mode.
  console.error(
    JSON.stringify({
      level: 'fatal',
      service: 'aggregator',
      event: 'bootstrap.failed',
      message,
      hint: 'If this is a NATS or Mongo connection error, ensure `pnpm dev:infra` is running.',
    }),
  );
  process.exit(1);
}
