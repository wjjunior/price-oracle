import { z } from 'zod';

export const DEFAULT_BINANCE_WS_URL =
  'wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade';
export const DEFAULT_NATS_URL = 'nats://localhost:4222';

const HttpsOrWssUrl = z
  .string()
  .url({ message: 'must be a full URL with scheme' })
  .refine((v) => /^(wss?|https?):\/\//i.test(v), {
    message: 'scheme must be ws(s) or http(s)',
  });

const NatsUrl = z
  .string()
  .url({ message: 'must be a full URL with scheme' })
  .refine((v) => /^nats:\/\//i.test(v), { message: 'scheme must be nats://' });

const EnvSchema = z.object({
  BINANCE_WS_URL: HttpsOrWssUrl.default(DEFAULT_BINANCE_WS_URL),
  NATS_URL: NatsUrl.default(DEFAULT_NATS_URL),
});

export type IngestorConfig = {
  binanceWsUrl: string;
  natsUrl: string;
};

export function loadIngestorConfig(env: NodeJS.ProcessEnv = process.env): IngestorConfig {
  const parsed = EnvSchema.parse(env);
  return {
    binanceWsUrl: parsed.BINANCE_WS_URL,
    natsUrl: parsed.NATS_URL,
  };
}

export const INGESTOR_CONFIG = Symbol.for('@price-oracle/ingestor-binance/config');
