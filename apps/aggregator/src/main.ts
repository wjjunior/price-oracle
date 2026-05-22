import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AGGREGATOR_CONFIG, type AggregatorConfig } from './config/env.schema.js';
import { AppModule } from './interface/app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const cfg = app.get<AggregatorConfig>(AGGREGATOR_CONFIG);
  app.enableCors({ origin: cfg.corsOrigin });
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
      service: 'aggregator',
      event: 'bootstrap.failed',
      message,
      hint: 'If this is a NATS or Mongo connection error, ensure `pnpm dev:infra` is running.',
    }),
  );
  process.exit(1);
}
