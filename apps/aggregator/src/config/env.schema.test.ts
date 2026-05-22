import { describe, expect, it } from 'vitest';

import { loadAggregatorConfig } from './env.schema.js';

describe('loadAggregatorConfig', () => {
  it('should read ANTHROPIC_API_KEY when present', () => {
    expect(loadAggregatorConfig({ ANTHROPIC_API_KEY: 'sk-test' })).toMatchObject({
      anthropicApiKey: 'sk-test',
    });
  });

  it('should omit anthropicApiKey when the env var is unset', () => {
    const config = loadAggregatorConfig({});
    expect('anthropicApiKey' in config).toBe(false);
  });

  it('should reject an empty ANTHROPIC_API_KEY', () => {
    expect(() => loadAggregatorConfig({ ANTHROPIC_API_KEY: '' })).toThrow();
  });

  it('should apply defaults for connection and http settings', () => {
    expect(loadAggregatorConfig({})).toMatchObject({
      natsUrl: 'nats://localhost:4222',
      mongoUrl: 'mongodb://localhost:27017/price_oracle',
      httpPort: 7402,
      corsOrigin: 'http://localhost:5173',
    });
  });

  it('should coerce AGGREGATOR_HTTP_PORT and override CORS_ORIGIN', () => {
    const config = loadAggregatorConfig({
      AGGREGATOR_HTTP_PORT: '8080',
      CORS_ORIGIN: 'https://dash.example',
    });
    expect(config.httpPort).toBe(8080);
    expect(config.corsOrigin).toBe('https://dash.example');
  });

  it('should reject a NATS_URL without the nats scheme', () => {
    expect(() => loadAggregatorConfig({ NATS_URL: 'http://localhost:4222' })).toThrow();
  });
});
