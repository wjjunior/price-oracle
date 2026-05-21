import type { Price } from '../primitives.js';

export type WeightedSample = { value: Price; weight: number };

export const weightedMedian = (samples: readonly WeightedSample[]): Price => {
  for (const sample of samples) {
    if (sample.weight < 0) {
      throw new Error('weightedMedian: weights must be non-negative');
    }
  }

  const contributing = samples.filter((s) => s.weight > 0);
  if (contributing.length === 0) {
    throw new Error('weightedMedian: at least one sample with positive weight is required');
  }

  const sorted = [...contributing].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, s) => sum + s.weight, 0);

  let cumulative = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i]!.weight;
    const doubled = cumulative * 2;
    if (doubled > totalWeight) return sorted[i]!.value;
    if (doubled === totalWeight && i + 1 < sorted.length) {
      return (sorted[i]!.value + sorted[i + 1]!.value) / 2;
    }
  }

  return sorted[sorted.length - 1]!.value;
};
