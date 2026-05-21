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

  it('should clamp to 0 once dispersion reaches the mean', () => {
    expect(computeAgreement([50, 150])).toBeCloseTo(0.5, 4);
  });
});
