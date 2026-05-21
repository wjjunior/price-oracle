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
