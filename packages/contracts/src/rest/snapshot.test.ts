import { describe, expect, it } from 'vitest';

import { validGetSnapshotResponse } from '../__test-helpers__/factories.js';

import { GetSnapshotResponseSchema } from './snapshot.js';

describe('GetSnapshotResponseSchema', () => {
  it('should round-trip a valid snapshot', () => {
    const response = validGetSnapshotResponse();
    expect(GetSnapshotResponseSchema.parse(response)).toEqual(response);
  });

  it('should accept a null aggregate when no ticks have been observed yet', () => {
    const response = validGetSnapshotResponse({ aggregate: null });
    expect(GetSnapshotResponseSchema.parse(response)).toEqual(response);
  });

  it('should accept an empty sources array', () => {
    const response = validGetSnapshotResponse({ sources: [] });
    expect(GetSnapshotResponseSchema.parse(response)).toEqual(response);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(
      GetSnapshotResponseSchema.safeParse({ ...validGetSnapshotResponse(), extra: 1 }).success,
    ).toBe(false);
  });
});
