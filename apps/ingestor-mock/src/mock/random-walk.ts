import type { Price } from '@price-oracle/contracts/primitives';

export type RandFn = () => number;

export interface Step {
  readonly volatilityPct: number;
  readonly rand: RandFn;
}

export const nextPrice = (prev: Price, step: Step): Price => {
  const delta = (step.rand() - 0.5) * 2 * step.volatilityPct;
  return prev * (1 + delta);
};
