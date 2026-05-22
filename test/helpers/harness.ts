import type { INestApplication } from '@nestjs/common';

const MOCK_HTTP_PORT = 14101;
const AGGREGATOR_HTTP_PORT = 14102;
const MONGO_DB_NAME = 'price_oracle';

export type Stack = {
  readonly mockUrl: string;
  readonly aggUrl: string;
  close: () => Promise<void>;
};

const ENV_KEYS = [
  'NATS_URL',
  'MONGO_URL',
  'MOCK_HTTP_PORT',
  'AGGREGATOR_HTTP_PORT',
  'CORS_ORIGIN',
  'MOCK_TICK_INTERVAL_MS',
  'AGGREGATOR_SOURCES',
  'AGGREGATION_INTERVAL_MS',
  'FRESHNESS_DECAY_MS',
  'DEGRADED_AFTER_MS',
  'STALE_AFTER_MS',
  'HEALTH_HYSTERESIS_STREAK',
  'BREAKER_CONFIDENCE_FLOOR',
  'BREAKER_TRIP_STREAK',
  'BREAKER_RECOVERY_WINDOW_MS',
  'BREAKER_HALF_OPEN_PROBE_STREAK',
  'ANTHROPIC_API_KEY',
] as const;

const withDatabase = (mongoUrl: string, dbName: string): string => {
  const url = new URL(mongoUrl);
  url.pathname = `/${dbName}`;
  url.searchParams.set('directConnection', 'true');
  return url.toString();
};

export async function startStack(env: { natsUrl: string; mongoUrl: string }): Promise<Stack> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];

  process.env.NATS_URL = env.natsUrl;
  process.env.MONGO_URL = withDatabase(env.mongoUrl, MONGO_DB_NAME);
  process.env.MOCK_HTTP_PORT = String(MOCK_HTTP_PORT);
  process.env.AGGREGATOR_HTTP_PORT = String(AGGREGATOR_HTTP_PORT);
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.MOCK_TICK_INTERVAL_MS = '100';
  process.env.AGGREGATOR_SOURCES = 'mock';
  process.env.AGGREGATION_INTERVAL_MS = '100';
  process.env.FRESHNESS_DECAY_MS = '2000';
  process.env.DEGRADED_AFTER_MS = '300';
  process.env.STALE_AFTER_MS = '600';
  process.env.HEALTH_HYSTERESIS_STREAK = '1';
  process.env.BREAKER_CONFIDENCE_FLOOR = '0.6';
  process.env.BREAKER_TRIP_STREAK = '3';
  process.env.BREAKER_RECOVERY_WINDOW_MS = '1500';
  process.env.BREAKER_HALF_OPEN_PROBE_STREAK = '3';
  delete process.env.ANTHROPIC_API_KEY;

  let mockApp: INestApplication | undefined;
  let aggApp: INestApplication | undefined;

  const restoreEnv = (): void => {
    for (const key of ENV_KEYS) {
      const previous = saved[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  };

  const close = async (): Promise<void> => {
    const errors: Error[] = [];
    const bestEffort = async (step: () => Promise<unknown>): Promise<void> => {
      try {
        await step();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    };
    try {
      await bestEffort(async () => aggApp?.close());
      await bestEffort(async () => mockApp?.close());
    } finally {
      restoreEnv();
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'integration stack teardown failed');
  };

  try {
    await import('reflect-metadata');
    const { NestFactory } = await import('@nestjs/core');

    const mockModule = await import('../../apps/ingestor-mock/src/app.module.js');
    mockApp = await NestFactory.create(mockModule.AppModule, { logger: false });
    await mockApp.listen(MOCK_HTTP_PORT);

    const aggregatorModule = await import('../../apps/aggregator/src/interface/app.module.js');
    aggApp = await NestFactory.create(aggregatorModule.AppModule, { logger: false });
    aggApp.enableShutdownHooks();
    await aggApp.listen(AGGREGATOR_HTTP_PORT);
  } catch (err) {
    try {
      await close();
    } catch {
      // swallow teardown failures during failed startup; rethrow the original error
    }
    throw err;
  }

  return {
    mockUrl: `http://127.0.0.1:${MOCK_HTTP_PORT}`,
    aggUrl: `http://127.0.0.1:${AGGREGATOR_HTTP_PORT}`,
    close,
  };
}
