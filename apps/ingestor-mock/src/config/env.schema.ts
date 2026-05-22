import { z } from 'zod';

export const DEFAULT_NATS_URL = 'nats://localhost:4222';
export const DEFAULT_HTTP_PORT = 7401;
export const DEFAULT_TICK_INTERVAL_MS = 250;
export const DEFAULT_BTC_ANCHOR_USD = 95_000;
export const DEFAULT_ETH_ANCHOR_USD = 3_500;
export const DEFAULT_PRICE_VOLATILITY_PCT = 0.001;
export const DEFAULT_ADMIN_ENABLED = false;

const NatsUrl = z.url({ error: 'must be a full URL with scheme', protocol: /^nats$/i });

const EnvSchema = z.object({
  MOCK_HTTP_PORT: z.coerce.number().int().positive().default(DEFAULT_HTTP_PORT),
  MOCK_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(DEFAULT_TICK_INTERVAL_MS),
  MOCK_BTC_ANCHOR_USD: z.coerce.number().positive().default(DEFAULT_BTC_ANCHOR_USD),
  MOCK_ETH_ANCHOR_USD: z.coerce.number().positive().default(DEFAULT_ETH_ANCHOR_USD),
  MOCK_PRICE_VOLATILITY_PCT: z.coerce.number().nonnegative().default(DEFAULT_PRICE_VOLATILITY_PCT),
  MOCK_ADMIN_ENABLED: z.stringbool().default(DEFAULT_ADMIN_ENABLED),
  NATS_URL: NatsUrl.default(DEFAULT_NATS_URL),
});

export type IngestorConfig = {
  httpPort: number;
  tickIntervalMs: number;
  btcAnchorUsd: number;
  ethAnchorUsd: number;
  priceVolatilityPct: number;
  adminEnabled: boolean;
  natsUrl: string;
};

export function loadIngestorConfig(env: NodeJS.ProcessEnv = process.env): IngestorConfig {
  const parsed = EnvSchema.parse(env);
  return {
    httpPort: parsed.MOCK_HTTP_PORT,
    tickIntervalMs: parsed.MOCK_TICK_INTERVAL_MS,
    btcAnchorUsd: parsed.MOCK_BTC_ANCHOR_USD,
    ethAnchorUsd: parsed.MOCK_ETH_ANCHOR_USD,
    priceVolatilityPct: parsed.MOCK_PRICE_VOLATILITY_PCT,
    adminEnabled: parsed.MOCK_ADMIN_ENABLED,
    natsUrl: parsed.NATS_URL,
  };
}

export const INGESTOR_CONFIG = Symbol.for('@price-oracle/ingestor-mock/config');
