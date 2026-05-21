import fc from 'fast-check';
import { describe, it } from 'vitest';

import { computeFreshness } from './freshness.js';

const finiteMillis = fc.integer({ min: 0, max: 10 ** 13 });
const positiveDecay = fc.integer({ min: 1, max: 10 ** 9 });

describe('computeFreshness (properties)', () => {
  it('should always return a value in [0, 1]', () => {
    fc.assert(
      fc.property(finiteMillis, finiteMillis, positiveDecay, (now, lastTickAt, decayMs) => {
        const result = computeFreshness(now, lastTickAt, decayMs);
        return result >= 0 && result <= 1;
      }),
    );
  });

  it('should be monotonically non-increasing as the tick ages', () => {
    fc.assert(
      fc.property(
        finiteMillis,
        fc.integer({ min: 0, max: 10 ** 9 }),
        fc.integer({ min: 0, max: 10 ** 9 }),
        positiveDecay,
        (lastTickAt, deltaA, deltaB, decayMs) => {
          const earlier = lastTickAt + Math.min(deltaA, deltaB);
          const later = lastTickAt + Math.max(deltaA, deltaB);
          return (
            computeFreshness(later, lastTickAt, decayMs) <=
            computeFreshness(earlier, lastTickAt, decayMs)
          );
        },
      ),
    );
  });

  it('should return 0 once the age reaches or exceeds the decay window', () => {
    fc.assert(
      fc.property(
        finiteMillis,
        positiveDecay,
        fc.integer({ min: 0, max: 10 ** 9 }),
        (lastTickAt, decayMs, overshoot) => {
          return computeFreshness(lastTickAt + decayMs + overshoot, lastTickAt, decayMs) === 0;
        },
      ),
    );
  });

  it('should return 1 when lastTickAt is at or after now (no positive age)', () => {
    fc.assert(
      fc.property(
        finiteMillis,
        fc.integer({ min: 0, max: 10 ** 9 }),
        positiveDecay,
        (now, futureOffset, decayMs) => {
          return computeFreshness(now, now + futureOffset, decayMs) === 1;
        },
      ),
    );
  });
});
