import fc from 'fast-check';
import { describe, it } from 'vitest';

import { computeConfidence } from './confidence.js';

const unitInterval = fc.double({
  min: 0,
  max: 1,
  noDefaultInfinity: true,
  noNaN: true,
});

describe('computeConfidence (properties)', () => {
  it('should always return a value in [0, 1] given inputs in [0, 1]', () => {
    fc.assert(
      fc.property(unitInterval, unitInterval, unitInterval, (f, a, c) => {
        const result = computeConfidence(f, a, c);
        return result >= 0 && result <= 1;
      }),
    );
  });

  it('should equal 0 whenever any factor is 0', () => {
    fc.assert(
      fc.property(unitInterval, unitInterval, (a, b) => {
        return (
          computeConfidence(0, a, b) === 0 &&
          computeConfidence(a, 0, b) === 0 &&
          computeConfidence(a, b, 0) === 0
        );
      }),
    );
  });

  it('should be monotonically non-decreasing in each factor', () => {
    fc.assert(
      fc.property(unitInterval, unitInterval, unitInterval, unitInterval, (a, b, c, d) => {
        const lower = Math.min(a, b);
        const higher = Math.max(a, b);
        return (
          computeConfidence(higher, c, d) >= computeConfidence(lower, c, d) &&
          computeConfidence(c, higher, d) >= computeConfidence(c, lower, d) &&
          computeConfidence(c, d, higher) >= computeConfidence(c, d, lower)
        );
      }),
    );
  });
});
