import fc from 'fast-check';
import { describe, it } from 'vitest';

import { computeCoverage } from './coverage.js';

const nonNegativeCount = fc.integer({ min: 0, max: 1_000 });

describe('computeCoverage (properties)', () => {
  it('should always return a value in [0, 1]', () => {
    fc.assert(
      fc.property(nonNegativeCount, nonNegativeCount, (active, total) => {
        const result = computeCoverage(active, total);
        return result >= 0 && result <= 1;
      }),
    );
  });

  it('should be monotonically non-decreasing in active count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000 }),
        fc.integer({ min: 0, max: 1_000 }),
        fc.integer({ min: 0, max: 1_000 }),
        (total, a, b) => {
          const lower = Math.min(a, b);
          const higher = Math.max(a, b);
          return computeCoverage(higher, total) >= computeCoverage(lower, total);
        },
      ),
    );
  });

  it('should equal active/total when active is between 0 and total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000 }),
        fc.integer({ min: 1, max: 1_000 }),
        (total, active) => {
          const capped = Math.min(active, total);
          return computeCoverage(capped, total) === capped / total;
        },
      ),
    );
  });
});
