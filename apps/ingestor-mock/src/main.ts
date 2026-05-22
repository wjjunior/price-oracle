import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { INGESTOR_CONFIG, type IngestorConfig } from './config/env.schema.js';

const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  abortOnError: false,
});
app.useLogger(app.get(Logger));
app.enableShutdownHooks();

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
