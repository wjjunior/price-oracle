import { describe, expect, it } from 'vitest';

import { DiagnoseRateLimitedError } from '../../domain/ports/diagnose.port.js';

import { createDiagnosePort } from './create-diagnose-port.js';


import type { AnthropicLike } from './anthropic-diagnose.adapter.js';
import type { DiagnoseContext } from '../../domain/ports/diagnose.port.js';
import type { SourceState } from '../../domain/types.js';

function source(over: Partial<SourceState> = {}): SourceState {
  return {
    asset: 'btc',
    source: 'binance',
    health: 'HEALTHY',
    lastTickAt: 1_000,
    lastPrice: 100,
    pendingHealth: null,
    pendingStreak: 0,
    ...over,
  };
}

function makeContext(over: Partial<DiagnoseContext> = {}): DiagnoseContext {
  return {
    asset: 'btc',
    confidence: 0.9,
    breaker: 'CLOSED',
    recentEvents: [],
    sources: [source()],
    ...over,
  };
}

const fakeClient: AnthropicLike = {
  messages: {
    create: () =>
      Promise.resolve({
        content: [{ type: 'text', text: '# Real diagnosis' }],
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
  },
};

describe('createDiagnosePort', () => {
  it('should use the real adapter when an apiKey is provided', async () => {
    const port = createDiagnosePort({ apiKey: 'sk-test', client: fakeClient, clock: () => 0 });
    const result = await port.diagnose(makeContext());
    expect(result.markdown).toBe('# Real diagnosis');
  });

  it('should use the deterministic stub when no apiKey is provided', async () => {
    const port = createDiagnosePort({ clock: () => 0 });
    const result = await port.diagnose(makeContext());
    expect(result.markdown).toContain('stub');
    expect(result.markdown).toContain('btc');
  });

  it('should wrap the chosen adapter with the rate limiter', async () => {
    let now = 0;
    const port = createDiagnosePort({ clock: () => now });
    await port.diagnose(makeContext({ confidence: 0.1 }));
    now = 1_000;
    await expect(port.diagnose(makeContext({ confidence: 0.2 }))).rejects.toBeInstanceOf(
      DiagnoseRateLimitedError,
    );
  });
});
