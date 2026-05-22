import { z } from 'zod';

const NatsUrl = z.url({ error: 'must be a full URL with scheme', protocol: /^nats$/i });

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  NATS_URL: NatsUrl.default('nats://localhost:4222'),
  MONGO_URL: z.string().min(1).default('mongodb://localhost:27017/price_oracle'),
  AGGREGATOR_HTTP_PORT: z.coerce.number().int().positive().default(7402),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
});

export type AggregatorConfig = {
  anthropicApiKey?: string;
  natsUrl: string;
  mongoUrl: string;
  httpPort: number;
  corsOrigin: string;
};

export function loadAggregatorConfig(env: NodeJS.ProcessEnv = process.env): AggregatorConfig {
  const parsed = EnvSchema.parse(env);
  const base: AggregatorConfig = {
    natsUrl: parsed.NATS_URL,
    mongoUrl: parsed.MONGO_URL,
    httpPort: parsed.AGGREGATOR_HTTP_PORT,
    corsOrigin: parsed.CORS_ORIGIN,
  };
  return parsed.ANTHROPIC_API_KEY === undefined
    ? base
    : { ...base, anthropicApiKey: parsed.ANTHROPIC_API_KEY };
}

export const AGGREGATOR_CONFIG = Symbol.for('@price-oracle/aggregator/config');
