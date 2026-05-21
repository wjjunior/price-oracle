import { describe, expect, it } from 'vitest';

import { DEFAULT_COINBASE_WS_URL, DEFAULT_NATS_URL, loadIngestorConfig } from './env.schema.js';

describe('loadIngestorConfig', () => {
  it('should apply defaults when env vars are absent', () => {
    const cfg = loadIngestorConfig({});
    expect(cfg.coinbaseWsUrl).toBe(DEFAULT_COINBASE_WS_URL);
    expect(cfg.natsUrl).toBe(DEFAULT_NATS_URL);
  });

  it('should accept explicit wss:// and nats:// URLs', () => {
    const cfg = loadIngestorConfig({
      COINBASE_WS_URL: 'wss://example.test/ws',
      NATS_URL: 'nats://nats.example.test:4222',
    });
    expect(cfg.coinbaseWsUrl).toBe('wss://example.test/ws');
    expect(cfg.natsUrl).toBe('nats://nats.example.test:4222');
  });

  it('should reject a NATS_URL with a non-nats scheme', () => {
    expect(() => loadIngestorConfig({ NATS_URL: 'http://nats.example.test:4222' })).toThrow();
  });

  it('should reject a COINBASE_WS_URL with a non-ws/http scheme', () => {
    expect(() => loadIngestorConfig({ COINBASE_WS_URL: 'ftp://example.test' })).toThrow();
  });

  it('should reject an empty NATS_URL string', () => {
    expect(() => loadIngestorConfig({ NATS_URL: '' })).toThrow();
  });
});
