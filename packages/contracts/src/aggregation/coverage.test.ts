import { describe, expect, it } from 'vitest';

import { computeCoverage } from './coverage.js';

describe('computeCoverage', () => {
  it('should return 1 when every source is active', () => {
    expect(computeCoverage(3, 3)).toBe(1);
  });

  it('should return 0 when no source is active', () => {
    expect(computeCoverage(0, 3)).toBe(0);
  });

  it('should return the active fraction for partial coverage', () => {
    expect(computeCoverage(2, 4)).toBe(0.5);
  });

  it('should return 0 when the total is zero', () => {
    expect(computeCoverage(0, 0)).toBe(0);
  });

  it('should clamp to 1 when active exceeds total', () => {
    expect(computeCoverage(5, 3)).toBe(1);
  });
});
