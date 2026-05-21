import fc from 'fast-check';
import { describe, it } from 'vitest';

import { computeAgreement } from './agreement.js';

const positivePrice = fc.double({
  min: 0.01,
  max: 10 ** 9,
  noDefaultInfinity: true,
  noNaN: true,
});

describe('computeAgreement (properties)', () => {
  it('should always return a value in [0, 1]', () => {
    fc.assert(
      fc.property(fc.array(positivePrice, { maxLength: 16 }), (prices) => {
        const result = computeAgreement(prices);
        return result >= 0 && result <= 1;
      }),
    );
  });

  it('should return 1 when every price is identical', () => {
    fc.assert(
      fc.property(positivePrice, fc.integer({ min: 1, max: 12 }), (price, count) => {
        return computeAgreement(Array.from({ length: count }, () => price)) === 1;
      }),
    );
  });

  it('should be invariant under permutation of inputs', () => {
    fc.assert(
      fc.property(fc.array(positivePrice, { minLength: 2, maxLength: 16 }), (prices) => {
        const shuffled = [...prices].reverse();
        return Math.abs(computeAgreement(prices) - computeAgreement(shuffled)) < 1e-12;
      }),
    );
  });
});
