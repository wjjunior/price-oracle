import { describe, expect, it } from 'vitest';

import { validGetAuditResponse } from '../__test-helpers__/factories.js';

import { GetAuditResponseSchema } from './audit.js';

describe('GetAuditResponseSchema', () => {
  it('should round-trip a valid audit response', () => {
    const response = validGetAuditResponse();
    expect(GetAuditResponseSchema.parse(response)).toEqual(response);
  });

  it('should accept an empty events array', () => {
    const response = validGetAuditResponse({ events: [] });
    expect(GetAuditResponseSchema.parse(response)).toEqual(response);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(
      GetAuditResponseSchema.safeParse({ ...validGetAuditResponse(), extra: 1 }).success,
    ).toBe(false);
  });
});
