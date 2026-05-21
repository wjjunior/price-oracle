import type { Price } from '../primitives.js';

export const computeAgreement = (activePrices: readonly Price[]): number => {
  if (activePrices.length === 0) return 0;
  if (activePrices.length === 1) return 1;

  let min = activePrices[0]!;
  let max = min;
  let sum = 0;
  for (const price of activePrices) {
    if (price < min) min = price;
    if (price > max) max = price;
    sum += price;
  }
  if (min === max) return 1;

  const mean = sum / activePrices.length;
  if (mean <= 0) return 0;

  let squaredDeviationSum = 0;
  for (const price of activePrices) {
    squaredDeviationSum += (price - mean) ** 2;
  }
  const coefficientOfVariation = Math.sqrt(squaredDeviationSum / activePrices.length) / mean;

  return Math.max(0, 1 - coefficientOfVariation);
};
