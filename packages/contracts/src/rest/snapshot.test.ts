import { describe, expect, it } from 'vitest';

import { validGetSnapshotResponse } from '../__test-helpers__/factories.js';

import { GetSnapshotResponseSchema } from './snapshot.js';

describe('GetSnapshotResponseSchema', () => {
  it('round-trips a valid snapshot', () => {
    const response = validGetSnapshotResponse();
    expect(GetSnapshotResponseSchema.parse(response)).toEqual(response);
  });

  it('accepts a snapshot with null aggregate (no ticks observed yet)', () => {
    const response = validGetSnapshotResponse({ aggregate: null });
    expect(GetSnapshotResponseSchema.parse(response)).toEqual(response);
  });

  it('accepts a snapshot with an empty sources array', () => {
    const response = validGetSnapshotResponse({ sources: [] });
    expect(GetSnapshotResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects an unknown breaker state', () => {
    expect(
      GetSnapshotResponseSchema.safeParse({ ...validGetSnapshotResponse(), breaker: 'TRIPPED' })
        .success,
    ).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    expect(
      GetSnapshotResponseSchema.safeParse({ ...validGetSnapshotResponse(), extra: 1 }).success,
    ).toBe(false);
  });
});
