import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { INGESTOR_CONFIG, type IngestorConfig } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const cfg = app.get<IngestorConfig>(INGESTOR_CONFIG);
  await app.listen(cfg.MOCK_HTTP_PORT);
}

// Boot failures (unreachable NATS, invalid env) occur before the pino logger is
// flushed, so emit a structured fatal line directly and exit non-zero.
void bootstrap().catch((err: unknown) => {
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
});
