import { z } from 'zod';

export const INGESTOR_CONFIG = 'INGESTOR_CONFIG';

export const EnvSchema = z.object({
  MOCK_HTTP_PORT: z.coerce.number().int().positive().default(7401),
  MOCK_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(250),
  MOCK_BTC_ANCHOR_USD: z.coerce.number().positive().default(95_000),
  MOCK_ETH_ANCHOR_USD: z.coerce.number().positive().default(3_500),
  MOCK_PRICE_VOLATILITY_PCT: z.coerce.number().nonnegative().default(0.001),
  NATS_URL: z.url().default('nats://localhost:4222'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type IngestorConfig = z.infer<typeof EnvSchema>;

export const loadConfig = (env: Record<string, string | undefined>): IngestorConfig =>
  EnvSchema.parse(env);
