import { describe, expect, it } from 'vitest';

import { StubDiagnoseAdapter } from './stub-diagnose.adapter.js';

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
    confidence: 0.42,
    breaker: 'OPEN',
    recentEvents: [],
    sources: [source({ source: 'coinbase', health: 'STALE' })],
    ...over,
  };
}

describe('StubDiagnoseAdapter', () => {
  it('should produce identical markdown for identical contexts', async () => {
    const adapter = new StubDiagnoseAdapter(() => 0);
    const a = await adapter.diagnose(makeContext());
    const b = await adapter.diagnose(makeContext());
    expect(a.markdown).toBe(b.markdown);
  });

  it('should mention the asset, breaker state, and a degraded source', async () => {
    const adapter = new StubDiagnoseAdapter(() => 0);
    const { markdown } = await adapter.diagnose(makeContext());
    expect(markdown).toContain('btc');
    expect(markdown).toContain('OPEN');
    expect(markdown).toContain('coinbase');
  });

  it('should produce different markdown for different contexts', async () => {
    const adapter = new StubDiagnoseAdapter(() => 0);
    const a = await adapter.diagnose(makeContext({ confidence: 0.42 }));
    const b = await adapter.diagnose(makeContext({ confidence: 0.99 }));
    expect(a.markdown).not.toBe(b.markdown);
  });

  it('should report measured latency and no token usage', async () => {
    let t = 100;
    const adapter = new StubDiagnoseAdapter(() => (t += 5));
    const result = await adapter.diagnose(makeContext());
    expect(result.latencyMs).toBe(5);
    expect(result.tokensUsed).toBeUndefined();
  });
});
