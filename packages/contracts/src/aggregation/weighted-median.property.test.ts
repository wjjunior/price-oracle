import fc from 'fast-check';
import { describe, it } from 'vitest';

import { weightedMedian, type WeightedSample } from './weighted-median.js';

const positivePrice = fc.double({
  min: 0.01,
  max: 10 ** 9,
  noDefaultInfinity: true,
  noNaN: true,
});

const positiveWeight = fc.double({
  min: 0.01,
  max: 10 ** 6,
  noDefaultInfinity: true,
  noNaN: true,
});

const sample: fc.Arbitrary<WeightedSample> = fc.record({
  value: positivePrice,
  weight: positiveWeight,
});

const sampleList = fc.array(sample, { minLength: 1, maxLength: 16 });

const simpleMedian = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[Math.floor(mid)]!;
};

describe('weightedMedian (properties)', () => {
  it('should always return a value within [min(values), max(values)]', () => {
    fc.assert(
      fc.property(sampleList, (samples) => {
        const values = samples.map((s) => s.value);
        const result = weightedMedian(samples);
        return result >= Math.min(...values) && result <= Math.max(...values);
      }),
    );
  });

  it('should equal the simple median when all weights are equal', () => {
    fc.assert(
      fc.property(
        fc.array(positivePrice, { minLength: 1, maxLength: 16 }),
        fc.integer({ min: 1, max: 10 }),
        (prices, weight) => {
          const samples = prices.map((value) => ({ value, weight }));
          return Math.abs(weightedMedian(samples) - simpleMedian(prices)) < 1e-9;
        },
      ),
    );
  });

  it('should be invariant under permutation of inputs', () => {
    fc.assert(
      fc.property(sampleList, fc.integer({ min: 0, max: 1_000_000 }), (samples, seed) => {
        const shuffled = [...samples].sort(
          (a, b) => ((a.value + seed) % 1) - ((b.value + seed) % 1),
        );
        return Math.abs(weightedMedian(samples) - weightedMedian(shuffled)) < 1e-9;
      }),
    );
  });

  it('should not change when a zero-weight sample is appended', () => {
    fc.assert(
      fc.property(sampleList, positivePrice, (samples, extraValue) => {
        const withZero = [...samples, { value: extraValue, weight: 0 }];
        return weightedMedian(samples) === weightedMedian(withZero);
      }),
    );
  });
});
