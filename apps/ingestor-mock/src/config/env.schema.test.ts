import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BTC_ANCHOR_USD,
  DEFAULT_ETH_ANCHOR_USD,
  DEFAULT_HTTP_PORT,
  DEFAULT_NATS_URL,
  DEFAULT_PRICE_VOLATILITY_PCT,
  DEFAULT_TICK_INTERVAL_MS,
  loadIngestorConfig,
} from './env.schema.js';

describe('loadIngestorConfig', () => {
  it('should apply defaults when env is empty', () => {
    const cfg = loadIngestorConfig({});
    expect(cfg.httpPort).toBe(DEFAULT_HTTP_PORT);
    expect(cfg.tickIntervalMs).toBe(DEFAULT_TICK_INTERVAL_MS);
    expect(cfg.btcAnchorUsd).toBe(DEFAULT_BTC_ANCHOR_USD);
    expect(cfg.ethAnchorUsd).toBe(DEFAULT_ETH_ANCHOR_USD);
    expect(cfg.priceVolatilityPct).toBe(DEFAULT_PRICE_VOLATILITY_PCT);
    expect(cfg.natsUrl).toBe(DEFAULT_NATS_URL);
  });

  it('should coerce numeric strings from env vars', () => {
    const cfg = loadIngestorConfig({ MOCK_HTTP_PORT: '8080', MOCK_TICK_INTERVAL_MS: '100' });
    expect(cfg.httpPort).toBe(8080);
    expect(cfg.tickIntervalMs).toBe(100);
  });

  it('should reject a non-positive tick interval', () => {
    expect(() => loadIngestorConfig({ MOCK_TICK_INTERVAL_MS: '0' })).toThrow();
    expect(() => loadIngestorConfig({ MOCK_TICK_INTERVAL_MS: '-5' })).toThrow();
  });

  it('should reject a NATS_URL with a non-nats scheme', () => {
    expect(() => loadIngestorConfig({ NATS_URL: 'https://nats.example.test:4222' })).toThrow();
  });

  it('should reject an empty NATS_URL string', () => {
    expect(() => loadIngestorConfig({ NATS_URL: '' })).toThrow();
  });

  it('should disable the admin API by default', () => {
    expect(loadIngestorConfig({}).adminEnabled).toBe(false);
  });

  it('should disable the admin API for falsey flag values', () => {
    expect(loadIngestorConfig({ MOCK_ADMIN_ENABLED: 'false' }).adminEnabled).toBe(false);
    expect(loadIngestorConfig({ MOCK_ADMIN_ENABLED: '0' }).adminEnabled).toBe(false);
  });

  it('should enable the admin API for truthy flag values', () => {
    expect(loadIngestorConfig({ MOCK_ADMIN_ENABLED: 'true' }).adminEnabled).toBe(true);
    expect(loadIngestorConfig({ MOCK_ADMIN_ENABLED: '1' }).adminEnabled).toBe(true);
  });
});
