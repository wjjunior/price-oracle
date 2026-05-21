import { describe, expect, it } from 'vitest';

import { DEFAULT_BINANCE_WS_URL, DEFAULT_NATS_URL, loadIngestorConfig } from './env.schema.js';

describe('loadIngestorConfig', () => {
  it('should apply defaults when env vars are absent', () => {
    const cfg = loadIngestorConfig({});
    expect(cfg.binanceWsUrl).toBe(DEFAULT_BINANCE_WS_URL);
    expect(cfg.natsUrl).toBe(DEFAULT_NATS_URL);
  });

  it('should accept explicit wss:// and nats:// URLs', () => {
    const cfg = loadIngestorConfig({
      BINANCE_WS_URL: 'wss://example.test/stream?streams=btcusdt@trade/ethusdt@trade',
      NATS_URL: 'nats://nats.example.test:4222',
    });
    expect(cfg.binanceWsUrl).toBe('wss://example.test/stream?streams=btcusdt@trade/ethusdt@trade');
    expect(cfg.natsUrl).toBe('nats://nats.example.test:4222');
  });

  it('should reject a NATS_URL with a non-nats scheme', () => {
    expect(() => loadIngestorConfig({ NATS_URL: 'http://nats.example.test:4222' })).toThrow();
  });

  it('should reject a BINANCE_WS_URL with a non-ws/http scheme', () => {
    expect(() => loadIngestorConfig({ BINANCE_WS_URL: 'ftp://example.test' })).toThrow();
  });

  it('should reject an empty NATS_URL string', () => {
    expect(() => loadIngestorConfig({ NATS_URL: '' })).toThrow();
  });
});
