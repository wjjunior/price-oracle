import { describe, expect, it } from 'vitest';

import { validPostDiagnoseResponse } from '../__test-helpers__/factories.js';

import { PostDiagnoseRequestSchema, PostDiagnoseResponseSchema } from './diagnose.js';

describe('PostDiagnoseRequestSchema', () => {
  it('should accept the body with or without the optional trigger', () => {
    expect(PostDiagnoseRequestSchema.parse({})).toEqual({});
    expect(PostDiagnoseRequestSchema.parse({ trigger: 'operator-manual' })).toEqual({
      trigger: 'operator-manual',
    });
  });

  it('should reject an empty trigger string', () => {
    expect(PostDiagnoseRequestSchema.safeParse({ trigger: '' }).success).toBe(false);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(PostDiagnoseRequestSchema.safeParse({ trigger: 'manual', extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('PostDiagnoseResponseSchema', () => {
  it('should round-trip a response, exercising the optional tokensUsed field', () => {
    const baseResponse = validPostDiagnoseResponse();
    expect(PostDiagnoseResponseSchema.parse(baseResponse)).toEqual(baseResponse);
    const withTokens = validPostDiagnoseResponse({ tokensUsed: 1_024 });
    expect(PostDiagnoseResponseSchema.parse(withTokens)).toEqual(withTokens);
  });

  it('should reject an empty markdown body', () => {
    expect(
      PostDiagnoseResponseSchema.safeParse(validPostDiagnoseResponse({ markdown: '' })).success,
    ).toBe(false);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(
      PostDiagnoseResponseSchema.safeParse({ ...validPostDiagnoseResponse(), extra: 1 }).success,
    ).toBe(false);
  });
});
