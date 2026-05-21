import { describe, expect, it } from 'vitest';

import { computeConfidence } from './confidence.js';

describe('computeConfidence', () => {
  it('should return 1 when every factor is 1', () => {
    expect(computeConfidence(1, 1, 1)).toBe(1);
  });

  it('should collapse to 0 when any factor is 0', () => {
    expect(computeConfidence(0, 1, 1)).toBe(0);
    expect(computeConfidence(1, 0, 1)).toBe(0);
    expect(computeConfidence(1, 1, 0)).toBe(0);
  });

  it('should multiply factors together', () => {
    expect(computeConfidence(0.5, 0.5, 0.5)).toBeCloseTo(0.125, 12);
  });
});
