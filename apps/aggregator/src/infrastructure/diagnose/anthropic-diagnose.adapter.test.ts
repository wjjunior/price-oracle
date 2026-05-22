import { describe, expect, it } from 'vitest';

import { DiagnoseUnavailableError } from '../../domain/ports/diagnose.port.js';

import { AnthropicDiagnoseAdapter, type AnthropicLike } from './anthropic-diagnose.adapter.js';


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

function makeContext(): DiagnoseContext {
  return {
    asset: 'btc',
    confidence: 0.9,
    breaker: 'CLOSED',
    recentEvents: [],
    sources: [source()],
  };
}

function clockReturning(...values: number[]): () => number {
  const queue = [...values];
  return () => queue.shift() ?? 0;
}

describe('AnthropicDiagnoseAdapter', () => {
  it('should return markdown from the text block, latency, and token usage', async () => {
    const client: AnthropicLike = {
      messages: {
        create: () =>
          Promise.resolve({
            content: [{ type: 'text', text: '# Result' }],
            usage: { input_tokens: 10, output_tokens: 20 },
          }),
      },
    };
    const adapter = new AnthropicDiagnoseAdapter(client, clockReturning(1_000, 1_050));
    const result = await adapter.diagnose(makeContext());
    expect(result.markdown).toBe('# Result');
    expect(result.latencyMs).toBe(50);
    expect(result.tokensUsed).toBe(30);
  });

  it('should pass an abort signal to the client', async () => {
    let received: AbortSignal | undefined;
    const client: AnthropicLike = {
      messages: {
        create: (_body, options) => {
          received = options?.signal;
          return Promise.resolve({ content: [{ type: 'text', text: 'x' }] });
        },
      },
    };
    const adapter = new AnthropicDiagnoseAdapter(client, clockReturning(0, 1));
    await adapter.diagnose(makeContext());
    expect(received).toBeInstanceOf(AbortSignal);
  });

  it('should throw DiagnoseUnavailableError when the client call fails', async () => {
    const client: AnthropicLike = {
      messages: { create: () => Promise.reject(new Error('network')) },
    };
    const adapter = new AnthropicDiagnoseAdapter(client, clockReturning(0, 1));
    await expect(adapter.diagnose(makeContext())).rejects.toBeInstanceOf(DiagnoseUnavailableError);
  });

  it('should throw DiagnoseUnavailableError when no text block is returned', async () => {
    const client: AnthropicLike = {
      messages: { create: () => Promise.resolve({ content: [] }) },
    };
    const adapter = new AnthropicDiagnoseAdapter(client, clockReturning(0, 1));
    await expect(adapter.diagnose(makeContext())).rejects.toBeInstanceOf(DiagnoseUnavailableError);
  });
});
