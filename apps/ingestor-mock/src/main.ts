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
