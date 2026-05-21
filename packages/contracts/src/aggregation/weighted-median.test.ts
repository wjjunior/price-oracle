import { describe, expect, it } from 'vitest';

import { weightedMedian } from './weighted-median.js';

describe('weightedMedian', () => {
  it('should return the only value when given a single sample', () => {
    expect(weightedMedian([{ value: 42, weight: 1 }])).toBe(42);
  });

  it('should equal the simple median when every weight is equal', () => {
    expect(
      weightedMedian([
        { value: 10, weight: 1 },
        { value: 20, weight: 1 },
        { value: 30, weight: 1 },
      ]),
    ).toBe(20);
  });

  it('should average the two middle values when weights tie at the midpoint', () => {
    expect(
      weightedMedian([
        { value: 10, weight: 1 },
        { value: 20, weight: 1 },
        { value: 30, weight: 1 },
        { value: 40, weight: 1 },
      ]),
    ).toBe(25);
  });

  it('should shift toward the value carrying the larger weight', () => {
    expect(
      weightedMedian([
        { value: 100, weight: 1 },
        { value: 200, weight: 10 },
        { value: 300, weight: 1 },
      ]),
    ).toBe(200);
  });

  it('should ignore samples with zero weight', () => {
    expect(
      weightedMedian([
        { value: 50, weight: 1 },
        { value: 100, weight: 0 },
        { value: 200, weight: 1 },
      ]),
    ).toBe(125);
  });

  it('should throw when no positive-weight sample remains', () => {
    expect(() => weightedMedian([])).toThrow();
    expect(() => weightedMedian([{ value: 1, weight: 0 }])).toThrow();
  });

  it('should throw on negative weights', () => {
    expect(() => weightedMedian([{ value: 1, weight: -1 }])).toThrow();
  });
});
