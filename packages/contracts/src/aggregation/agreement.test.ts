import { describe, expect, it } from 'vitest';

import { computeAgreement } from './agreement.js';

describe('computeAgreement', () => {
  it('should return 1 when every price matches', () => {
    expect(computeAgreement([100, 100, 100])).toBe(1);
  });

  it('should return 1 for a single price (no possible disagreement)', () => {
    expect(computeAgreement([42])).toBe(1);
  });

  it('should return 0 when no prices are provided', () => {
    expect(computeAgreement([])).toBe(0);
  });

  it('should reduce agreement proportionally to coefficient of variation', () => {
    expect(computeAgreement([99, 101])).toBeCloseTo(0.99, 4);
  });

  it('should track 1 - coefficient of variation for moderate dispersion', () => {
    expect(computeAgreement([50, 150])).toBeCloseTo(0.5, 4);
  });

  it('should clamp to 0 when dispersion exceeds the mean', () => {
    expect(computeAgreement([1, 1, 100])).toBe(0);
  });

  it('should return 0 when the mean of the input prices is non-positive', () => {
    // Price type is positive by contract, but the function defensively guards against
    // non-positive means. Exercising this branch ensures correctness if prices
    // ever contain zero or negative values (e.g. during fuzz testing).
    // Use [-1, 0, 1]: min != max so the early return is skipped; mean = 0 triggers the guard.
    expect(computeAgreement([-1, 0, 1] as unknown as number[])).toBe(0);
  });
});
