import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { INGESTOR_CONFIG, type IngestorConfig } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  const cfg = app.get<IngestorConfig>(INGESTOR_CONFIG);
  await app.listen(cfg.httpPort);

  // Explicit signal handling owns the single shutdown path (app.close runs the
  // lifecycle hooks), so enableShutdownHooks would only double-register them.
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shutdownPromise !== undefined) return;
    shutdownPromise = (async () => {
      try {
        await app.close();
      } finally {
        process.exit(signal === 'SIGINT' ? 130 : 0);
      }
    })();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

// Boot failures (unreachable NATS, invalid env) occur before the pino logger is
// flushed, so emit a structured fatal line directly and exit non-zero.
try {
  await bootstrap();
} catch (err: unknown) {
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
