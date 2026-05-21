import { describe, expect, it } from 'vitest';

import { loadConfig } from './env.schema.js';

describe('loadConfig', () => {
  it('should apply defaults when env is empty', () => {
    const cfg = loadConfig({});
    expect(cfg.MOCK_HTTP_PORT).toBe(7401);
    expect(cfg.MOCK_TICK_INTERVAL_MS).toBe(250);
    expect(cfg.MOCK_BTC_ANCHOR_USD).toBe(95_000);
    expect(cfg.MOCK_ETH_ANCHOR_USD).toBe(3_500);
    expect(cfg.MOCK_PRICE_VOLATILITY_PCT).toBe(0.001);
    expect(cfg.NATS_URL).toBe('nats://localhost:4222');
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('should coerce numeric strings from env vars', () => {
    const cfg = loadConfig({
      MOCK_HTTP_PORT: '8080',
      MOCK_TICK_INTERVAL_MS: '100',
    });
    expect(cfg.MOCK_HTTP_PORT).toBe(8080);
    expect(cfg.MOCK_TICK_INTERVAL_MS).toBe(100);
  });

  it('should fail boot on non-positive tick interval', () => {
    expect(() => loadConfig({ MOCK_TICK_INTERVAL_MS: '0' })).toThrow();
    expect(() => loadConfig({ MOCK_TICK_INTERVAL_MS: '-5' })).toThrow();
  });

  it('should fail boot on invalid NATS_URL', () => {
    expect(() => loadConfig({ NATS_URL: 'not-a-url' })).toThrow();
  });

  it('should fail boot on unknown LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'trace' })).toThrow();
  });
});
