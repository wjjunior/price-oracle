import { describe, expect, it } from 'vitest';

import { computeFreshness } from './freshness.js';

describe('computeFreshness', () => {
  it('should return 1 when the last tick arrived exactly now', () => {
    expect(computeFreshness(1_000, 1_000, 5_000)).toBe(1);
  });

  it('should return 0 when the age equals the decay window', () => {
    expect(computeFreshness(6_000, 1_000, 5_000)).toBe(0);
  });

  it('should return 0 when the age exceeds the decay window', () => {
    expect(computeFreshness(10_000, 1_000, 5_000)).toBe(0);
  });

  it('should decay linearly between now and the decay window', () => {
    expect(computeFreshness(3_500, 1_000, 5_000)).toBe(0.5);
  });

  it('should clamp to 1 when lastTickAt is in the future (clock skew)', () => {
    expect(computeFreshness(1_000, 2_000, 5_000)).toBe(1);
  });
});
