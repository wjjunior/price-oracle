import { describe, expect, it } from 'vitest';

import {
  validAggregatePrice,
  validSourceState,
  validSourceStateChanged,
} from '../__test-helpers__/factories.js';

import { SseEnvelopeSchema } from './envelope.js';

const CORRELATION_ID = 'corr-abc-123';

describe('SseEnvelopeSchema', () => {
  it('should accept every asset-bearing variant (aggregate, source-health, breaker-state)', () => {
    const envelopes = [
      {
        type: 'aggregate' as const,
        asset: 'btc' as const,
        data: validAggregatePrice(),
        correlationId: CORRELATION_ID,
      },
      {
        type: 'source-health' as const,
        asset: 'btc' as const,
        data: validSourceState(),
        correlationId: CORRELATION_ID,
      },
      {
        type: 'breaker-state' as const,
        asset: 'eth' as const,
        data: 'OPEN' as const,
        correlationId: CORRELATION_ID,
      },
    ];
    for (const e of envelopes) {
      expect(SseEnvelopeSchema.parse(e)).toEqual(e);
    }
  });

  it('should accept the audit variant without a top-level asset (asset lives on the inner event)', () => {
    const envelope = {
      type: 'audit' as const,
      data: validSourceStateChanged(),
      correlationId: CORRELATION_ID,
    };
    expect(SseEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('should reject an envelope missing correlationId', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'aggregate',
        asset: 'btc',
        data: validAggregatePrice(),
      }).success,
    ).toBe(false);
  });

  it('should reject an unknown discriminator value', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'tick',
        asset: 'btc',
        data: validAggregatePrice(),
        correlationId: CORRELATION_ID,
      }).success,
    ).toBe(false);
  });

  it('should reject a non-audit variant missing the top-level asset', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'aggregate',
        data: validAggregatePrice(),
        correlationId: CORRELATION_ID,
      }).success,
    ).toBe(false);
  });

  it('should reject data mismatched against the discriminator', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'aggregate',
        asset: 'btc',
        data: validSourceState(),
        correlationId: CORRELATION_ID,
      }).success,
    ).toBe(false);
  });

  it('should reject extra fields at the envelope level (strict mode)', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'aggregate',
        asset: 'btc',
        data: validAggregatePrice(),
        correlationId: CORRELATION_ID,
        extra: 1,
      }).success,
    ).toBe(false);
  });
});
