import {
  buildAnomalyDetectedEvent,
  buildBreakerStateChangedEvent,
  buildDiagnoseAnsweredEvent,
  buildDiagnoseRequestedEvent,
  buildSourceStateChangedEvent,
} from '@price-oracle/contracts/events';
import { describe, expect, it } from 'vitest';

import { describeAuditEvent } from './describe.js';

describe('describeAuditEvent', () => {
  it('should describe a source state change', () => {
    expect(
      describeAuditEvent(
        buildSourceStateChangedEvent({
          asset: 'btc',
          source: 'binance',
          from: 'HEALTHY',
          to: 'DEGRADED',
          at: 1,
        }),
      ),
    ).toBe('binance HEALTHY → DEGRADED');
  });

  it('should describe a breaker state change', () => {
    expect(
      describeAuditEvent(
        buildBreakerStateChangedEvent({ asset: 'eth', from: 'CLOSED', to: 'OPEN', reason: 'x', at: 1 }),
      ),
    ).toBe('breaker CLOSED → OPEN');
  });

  it('should describe an anomaly', () => {
    expect(
      describeAuditEvent(
        buildAnomalyDetectedEvent({
          asset: 'btc',
          source: 'mock',
          metric: 'price-drift',
          value: 0.012,
          threshold: 0.005,
          at: 1,
        }),
      ),
    ).toBe('price-drift 0.012 > 0.005');
  });

  it('should describe a diagnose request and answer', () => {
    expect(
      describeAuditEvent(buildDiagnoseRequestedEvent({ asset: 'btc', trigger: 'operator-manual', at: 1 })),
    ).toBe('diagnose requested (operator-manual)');
    expect(
      describeAuditEvent(buildDiagnoseAnsweredEvent({ asset: 'btc', latencyMs: 850, at: 1 })),
    ).toBe('diagnose answered (850 ms)');
  });
});
