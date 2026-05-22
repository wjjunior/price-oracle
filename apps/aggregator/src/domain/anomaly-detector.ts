import type { AnomalyConfig, SourceState } from './types.js';
import type { Price } from '@price-oracle/contracts/primitives';

const PERCENT = 100;

export type AnomalyResult = {
  readonly triggered: boolean;
  readonly deviationRatio: number;
};

export function detectAnomaly(
  state: SourceState,
  aggregatePrice: Price,
  cfg: AnomalyConfig,
): AnomalyResult {
  if (state.lastPrice === null) return { triggered: false, deviationRatio: 0 };
  const deviationRatio = (Math.abs(state.lastPrice - aggregatePrice) / aggregatePrice) * PERCENT;
  return { triggered: deviationRatio > cfg.driftTolerance, deviationRatio };
}
