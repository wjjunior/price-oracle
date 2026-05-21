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
