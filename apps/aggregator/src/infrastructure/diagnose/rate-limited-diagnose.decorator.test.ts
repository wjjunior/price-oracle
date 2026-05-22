import { describe, expect, it } from 'vitest';

import { DiagnoseRateLimitedError } from '../../domain/ports/diagnose.port.js';

import { RateLimitedDiagnose } from './rate-limited-diagnose.decorator.js';


import type {
  DiagnoseContext,
  DiagnosePort,
  DiagnoseResult,
} from '../../domain/ports/diagnose.port.js';
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

const result: DiagnoseResult = { markdown: '# ok', latencyMs: 1 };

function immediateInner(): { port: DiagnosePort; calls: () => number } {
  let calls = 0;
  return {
    port: {
      diagnose: () => {
        calls += 1;
        return Promise.resolve(result);
      },
    },
    calls: () => calls,
  };
}

describe('RateLimitedDiagnose', () => {
  it('should share a single in-flight call for concurrent identical requests', async () => {
    let calls = 0;
    let resolveInner: (r: DiagnoseResult) => void = () => {};
    const inner: DiagnosePort = {
      diagnose: () => {
        calls += 1;
        return new Promise<DiagnoseResult>((resolve) => {
          resolveInner = resolve;
        });
      },
    };
    const decorated = new RateLimitedDiagnose(inner, () => 0);
    const p1 = decorated.diagnose(makeContext());
    const p2 = decorated.diagnose(makeContext());
    expect(p1).toBe(p2);
    expect(calls).toBe(1);
    resolveInner(result);
    await expect(p1).resolves.toBe(result);
  });

  it('should share one rate-limit window per asset across differing request contexts', async () => {
    const inner = immediateInner();
    let now = 0;
    const decorated = new RateLimitedDiagnose(inner.port, () => now);
    await decorated.diagnose(makeContext({ confidence: 0.1 }));
    now = 4_000;
    await expect(decorated.diagnose(makeContext({ confidence: 0.2 }))).rejects.toBeInstanceOf(
      DiagnoseRateLimitedError,
    );
  });

  it('should report a positive retryAfterMs when rate limited', async () => {
    const inner = immediateInner();
    let now = 0;
    const decorated = new RateLimitedDiagnose(inner.port, () => now);
    await decorated.diagnose(makeContext({ confidence: 0.1 }));
    now = 4_000;
    const error = await decorated.diagnose(makeContext({ confidence: 0.2 })).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(DiagnoseRateLimitedError);
    if (error instanceof DiagnoseRateLimitedError) expect(error.retryAfterMs).toBe(6_000);
  });

  it('should allow a new call once the window has elapsed', async () => {
    const inner = immediateInner();
    let now = 0;
    const decorated = new RateLimitedDiagnose(inner.port, () => now);
    await decorated.diagnose(makeContext({ confidence: 0.1 }));
    now = 10_000;
    await expect(decorated.diagnose(makeContext({ confidence: 0.2 }))).resolves.toBe(result);
    expect(inner.calls()).toBe(2);
  });

  it('should rate-limit each asset independently', async () => {
    const inner = immediateInner();
    let now = 0;
    const decorated = new RateLimitedDiagnose(inner.port, () => now);
    await decorated.diagnose(makeContext({ asset: 'btc' }));
    now = 1_000;
    await expect(decorated.diagnose(makeContext({ asset: 'eth' }))).resolves.toBe(result);
  });

  it('should evict the in-flight key after the call settles', async () => {
    const inner = immediateInner();
    let now = 0;
    const decorated = new RateLimitedDiagnose(inner.port, () => now);
    await decorated.diagnose(makeContext());
    now = 20_000;
    await decorated.diagnose(makeContext());
    expect(inner.calls()).toBe(2);
  });
});
