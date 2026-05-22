import { buildAnomalyDetectedEvent } from '@price-oracle/contracts/events';
import { describe, expect, it } from 'vitest';

import { hashDiagnoseContext } from './diagnose-context-hash.js';

import type { DiagnoseContext } from '../../domain/ports/diagnose.port.js';
import type { SourceState } from '../../domain/types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';

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

describe('hashDiagnoseContext', () => {
  it('should return the same hash for identical contexts', () => {
    expect(hashDiagnoseContext(makeContext())).toBe(hashDiagnoseContext(makeContext()));
  });

  it('should be insensitive to source ordering', () => {
    const a = makeContext({
      sources: [source({ source: 'binance' }), source({ source: 'coinbase' })],
    });
    const b = makeContext({
      sources: [source({ source: 'coinbase' }), source({ source: 'binance' })],
    });
    expect(hashDiagnoseContext(a)).toBe(hashDiagnoseContext(b));
  });

  it('should change when confidence changes', () => {
    expect(hashDiagnoseContext(makeContext({ confidence: 0.9 }))).not.toBe(
      hashDiagnoseContext(makeContext({ confidence: 0.5 })),
    );
  });

  it('should change when the breaker state changes', () => {
    expect(hashDiagnoseContext(makeContext({ breaker: 'CLOSED' }))).not.toBe(
      hashDiagnoseContext(makeContext({ breaker: 'OPEN' })),
    );
  });

  it('should change when a source health changes', () => {
    expect(hashDiagnoseContext(makeContext({ sources: [source({ health: 'HEALTHY' })] }))).not.toBe(
      hashDiagnoseContext(makeContext({ sources: [source({ health: 'STALE' })] })),
    );
  });

  it('should change when recent events change', () => {
    const event = buildAnomalyDetectedEvent({
      asset: 'btc',
      source: 'binance',
      metric: 'drift',
      value: 5,
      threshold: 2,
      at: 1_000,
    });
    expect(hashDiagnoseContext(makeContext({ recentEvents: [] }))).not.toBe(
      hashDiagnoseContext(makeContext({ recentEvents: [event] })),
    );
  });

  it('should be insensitive to event key ordering', () => {
    const ordered = {
      type: 'AnomalyDetected',
      asset: 'btc',
      source: 'binance',
      metric: 'drift',
      value: 5,
      threshold: 2,
      at: 1_000,
    } satisfies AuditEvent;
    const scrambled = {
      at: 1_000,
      threshold: 2,
      value: 5,
      metric: 'drift',
      source: 'binance',
      asset: 'btc',
      type: 'AnomalyDetected',
    } satisfies AuditEvent;
    expect(hashDiagnoseContext(makeContext({ recentEvents: [ordered] }))).toBe(
      hashDiagnoseContext(makeContext({ recentEvents: [scrambled] })),
    );
  });

  it('should return a 16-character hex digest', () => {
    expect(hashDiagnoseContext(makeContext())).toHaveLength(16);
  });
});
