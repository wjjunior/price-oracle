import { describe, expect, it } from 'vitest';

import {
  validAnomalyDetected,
  validBreakerStateChanged,
  validDiagnoseAnswered,
  validDiagnoseRequested,
  validSourceStateChanged,
} from '../__test-helpers__/factories.js';

import {
  AnomalyDetectedSchema,
  AuditEventSchema,
  BreakerStateChangedSchema,
  DiagnoseAnsweredSchema,
  DiagnoseRequestedSchema,
  SourceStateChangedSchema,
  buildAnomalyDetectedEvent,
  buildBreakerStateChangedEvent,
  buildDiagnoseAnsweredEvent,
  buildDiagnoseRequestedEvent,
  buildSourceStateChangedEvent,
} from './audit-event.js';

describe('AuditEventSchema', () => {
  it('should accept every audit event variant (DiagnoseAnswered exercising optional tokensUsed)', () => {
    const events = [
      validSourceStateChanged(),
      validBreakerStateChanged(),
      validAnomalyDetected(),
      validDiagnoseRequested(),
      validDiagnoseAnswered({ tokensUsed: 420 }),
    ];
    for (const event of events) {
      expect(AuditEventSchema.parse(event)).toEqual(event);
    }
  });

  it('should reject an unknown type discriminator', () => {
    expect(
      AuditEventSchema.safeParse({ ...validSourceStateChanged(), type: 'AggregatePublished' })
        .success,
    ).toBe(false);
  });

  it('should reject data that does not match its discriminator', () => {
    const sourceShape = validSourceStateChanged();
    const mismatched = { ...sourceShape, type: 'BreakerStateChanged' as const };
    expect(AuditEventSchema.safeParse(mismatched).success).toBe(false);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(
      AuditEventSchema.safeParse({ ...validBreakerStateChanged(), extra: 'nope' }).success,
    ).toBe(false);
  });
});

const T = 1_747_142_400_000;

describe('audit event builders', () => {
  it('should build a SourceStateChanged event that satisfies its schema', () => {
    const event = buildSourceStateChangedEvent({
      asset: 'btc',
      source: 'binance',
      from: 'HEALTHY',
      to: 'DEGRADED',
      at: T,
    });
    expect(event.type).toBe('SourceStateChanged');
    expect(SourceStateChangedSchema.parse(event)).toEqual(event);
  });

  it('should build a BreakerStateChanged event that satisfies its schema', () => {
    const event = buildBreakerStateChangedEvent({
      asset: 'eth',
      from: 'CLOSED',
      to: 'OPEN',
      reason: 'confidence below floor for window',
      at: T,
    });
    expect(event.type).toBe('BreakerStateChanged');
    expect(BreakerStateChangedSchema.parse(event)).toEqual(event);
  });

  it('should build an AnomalyDetected event that satisfies its schema', () => {
    const event = buildAnomalyDetectedEvent({
      asset: 'btc',
      source: 'mock',
      metric: 'price-drift',
      value: 0.012,
      threshold: 0.005,
      at: T,
    });
    expect(event.type).toBe('AnomalyDetected');
    expect(AnomalyDetectedSchema.parse(event)).toEqual(event);
  });

  it('should build a DiagnoseRequested event that satisfies its schema', () => {
    const event = buildDiagnoseRequestedEvent({ asset: 'eth', trigger: 'operator-manual', at: T });
    expect(event.type).toBe('DiagnoseRequested');
    expect(DiagnoseRequestedSchema.parse(event)).toEqual(event);
  });

  it('should build a DiagnoseAnswered event without tokensUsed', () => {
    const event = buildDiagnoseAnsweredEvent({ asset: 'btc', latencyMs: 850, at: T });
    expect(event.type).toBe('DiagnoseAnswered');
    expect(event.tokensUsed).toBeUndefined();
    expect(DiagnoseAnsweredSchema.parse(event)).toEqual(event);
  });

  it('should build a DiagnoseAnswered event carrying tokensUsed', () => {
    const event = buildDiagnoseAnsweredEvent({ asset: 'btc', latencyMs: 850, tokensUsed: 420, at: T });
    expect(event.tokensUsed).toBe(420);
    expect(DiagnoseAnsweredSchema.parse(event)).toEqual(event);
  });

  it('should produce events accepted by the AuditEvent union', () => {
    const events = [
      buildSourceStateChangedEvent({ asset: 'btc', source: 'binance', from: 'HEALTHY', to: 'STALE', at: T }),
      buildBreakerStateChangedEvent({ asset: 'eth', from: 'OPEN', to: 'HALF_OPEN', reason: 'recovery', at: T }),
      buildAnomalyDetectedEvent({ asset: 'btc', source: 'mock', metric: 'drift', value: 1, threshold: 0.5, at: T }),
      buildDiagnoseRequestedEvent({ asset: 'eth', trigger: 'auto', at: T }),
      buildDiagnoseAnsweredEvent({ asset: 'btc', latencyMs: 10, at: T }),
    ];
    for (const event of events) {
      expect(AuditEventSchema.parse(event)).toEqual(event);
    }
  });
});
