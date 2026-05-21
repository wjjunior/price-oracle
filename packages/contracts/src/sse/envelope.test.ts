import { describe, expect, it } from 'vitest';

import {
  validAggregatePrice,
  validSourceState,
  validSourceStateChanged,
} from '../__test-helpers__/factories.js';

import { SseEnvelopeSchema } from './envelope.js';

const CORRELATION_ID = 'corr-abc-123';

describe('SseEnvelopeSchema', () => {
  it('accepts an aggregate envelope with asset and correlationId', () => {
    const envelope = {
      type: 'aggregate' as const,
      asset: 'btc' as const,
      data: validAggregatePrice(),
      correlationId: CORRELATION_ID,
    };
    expect(SseEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('accepts a source-health envelope carrying SourceState', () => {
    const envelope = {
      type: 'source-health' as const,
      asset: 'btc' as const,
      data: validSourceState(),
      correlationId: CORRELATION_ID,
    };
    expect(SseEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('accepts a breaker-state envelope carrying just the enum value', () => {
    const envelope = {
      type: 'breaker-state' as const,
      asset: 'eth' as const,
      data: 'OPEN' as const,
      correlationId: CORRELATION_ID,
    };
    expect(SseEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('accepts an audit envelope (no asset at the top level — it lives on the audit event)', () => {
    const envelope = {
      type: 'audit' as const,
      data: validSourceStateChanged(),
      correlationId: CORRELATION_ID,
    };
    expect(SseEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('rejects an envelope missing correlationId', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'aggregate',
        asset: 'btc',
        data: validAggregatePrice(),
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown discriminator value', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'tick',
        asset: 'btc',
        data: validAggregatePrice(),
        correlationId: CORRELATION_ID,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-audit variant missing the top-level asset', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'aggregate',
        data: validAggregatePrice(),
        correlationId: CORRELATION_ID,
      }).success,
    ).toBe(false);
  });

  it('rejects data mismatched against the discriminator', () => {
    expect(
      SseEnvelopeSchema.safeParse({
        type: 'aggregate',
        asset: 'btc',
        data: validSourceState(),
        correlationId: CORRELATION_ID,
      }).success,
    ).toBe(false);
  });

  it('rejects extra fields at the envelope level (strict)', () => {
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
