import { describe, expect, it } from 'vitest';

import { validGetAuditResponse } from '../__test-helpers__/factories.js';

import { GetAuditResponseSchema } from './audit.js';

describe('GetAuditResponseSchema', () => {
  it('round-trips a valid audit response', () => {
    const response = validGetAuditResponse();
    expect(GetAuditResponseSchema.parse(response)).toEqual(response);
  });

  it('accepts an empty events array', () => {
    const response = validGetAuditResponse({ events: [] });
    expect(GetAuditResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects extra fields (strict mode)', () => {
    expect(GetAuditResponseSchema.safeParse({ ...validGetAuditResponse(), extra: 1 }).success).toBe(
      false,
    );
  });
});
