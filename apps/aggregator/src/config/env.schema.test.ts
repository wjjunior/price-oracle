import { describe, expect, it } from 'vitest';

import { loadAggregatorConfig } from './env.schema.js';

describe('loadAggregatorConfig', () => {
  it('should read ANTHROPIC_API_KEY when present', () => {
    expect(loadAggregatorConfig({ ANTHROPIC_API_KEY: 'sk-test' })).toEqual({
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
});
