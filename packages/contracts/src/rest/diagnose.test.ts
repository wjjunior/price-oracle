import { describe, expect, it } from 'vitest';

import {
  validPostDiagnoseRequest,
  validPostDiagnoseResponse,
} from '../__test-helpers__/factories.js';

import { PostDiagnoseRequestSchema, PostDiagnoseResponseSchema } from './diagnose.js';

describe('PostDiagnoseRequestSchema', () => {
  it('accepts an empty body (trigger is optional)', () => {
    const request = validPostDiagnoseRequest();
    expect(PostDiagnoseRequestSchema.parse(request)).toEqual(request);
  });

  it('accepts a body with a trigger label', () => {
    const request = validPostDiagnoseRequest({ trigger: 'operator-manual' });
    expect(PostDiagnoseRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects an empty trigger string', () => {
    expect(PostDiagnoseRequestSchema.safeParse({ trigger: '' }).success).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    expect(PostDiagnoseRequestSchema.safeParse({ trigger: 'manual', extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('PostDiagnoseResponseSchema', () => {
  it('round-trips a valid response without tokensUsed', () => {
    const response = validPostDiagnoseResponse();
    expect(PostDiagnoseResponseSchema.parse(response)).toEqual(response);
  });

  it('round-trips a response carrying tokensUsed', () => {
    const response = validPostDiagnoseResponse({ tokensUsed: 1_024 });
    expect(PostDiagnoseResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects an empty markdown body', () => {
    expect(
      PostDiagnoseResponseSchema.safeParse(validPostDiagnoseResponse({ markdown: '' })).success,
    ).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    expect(
      PostDiagnoseResponseSchema.safeParse({ ...validPostDiagnoseResponse(), extra: 1 }).success,
    ).toBe(false);
  });
});
