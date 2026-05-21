import { describe, expect, it } from 'vitest';

import {
  validAnomalyDetected,
  validBreakerStateChanged,
  validDiagnoseAnswered,
  validDiagnoseRequested,
  validSourceStateChanged,
} from '../__test-helpers__/factories.js';

import { AuditEventSchema } from './audit-event.js';

describe('AuditEventSchema', () => {
  it('accepts a SourceStateChanged event', () => {
    const event = validSourceStateChanged();
    expect(AuditEventSchema.parse(event)).toEqual(event);
  });

  it('accepts a BreakerStateChanged event', () => {
    const event = validBreakerStateChanged();
    expect(AuditEventSchema.parse(event)).toEqual(event);
  });

  it('accepts an AnomalyDetected event', () => {
    const event = validAnomalyDetected();
    expect(AuditEventSchema.parse(event)).toEqual(event);
  });

  it('accepts a DiagnoseRequested event', () => {
    const event = validDiagnoseRequested();
    expect(AuditEventSchema.parse(event)).toEqual(event);
  });

  it('accepts a DiagnoseAnswered event with optional tokensUsed', () => {
    const event = validDiagnoseAnswered({ tokensUsed: 420 });
    expect(AuditEventSchema.parse(event)).toEqual(event);
  });

  it('rejects an unknown type discriminator', () => {
    expect(
      AuditEventSchema.safeParse({ ...validSourceStateChanged(), type: 'AggregatePublished' })
        .success,
    ).toBe(false);
  });

  it('rejects data that does not match the discriminator', () => {
    const sourceShape = validSourceStateChanged();
    const mismatched = { ...sourceShape, type: 'BreakerStateChanged' as const };
    expect(AuditEventSchema.safeParse(mismatched).success).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    expect(
      AuditEventSchema.safeParse({ ...validBreakerStateChanged(), extra: 'nope' }).success,
    ).toBe(false);
  });
});
