import {
  computeAgreement,
  computeConfidence,
  computeCoverage,
  computeFreshness,
  weightedMedian,
} from '@price-oracle/contracts/aggregation';

import { perSourceHealthScore } from './source-state.js';

import type { SourceState, Thresholds } from './types.js';
import type { Confidence, Millis, Price, SourceId } from '@price-oracle/contracts/primitives';

export type AggregateResult = {
  readonly price: Price;
  readonly confidence: Confidence;
  readonly contributingSources: readonly SourceId[];
};

type ActiveSource = {
  readonly source: SourceId;
  readonly price: Price;
  readonly lastTickAt: Millis;
  readonly weight: number;
};

export function aggregate(
  states: readonly SourceState[],
  now: Millis,
  cfg: Thresholds,
): AggregateResult | null {
  const active: ActiveSource[] = [];
  for (const state of states) {
    const weight = perSourceHealthScore(state, now, cfg);
    if (weight <= 0 || state.lastPrice === null || state.lastTickAt === null) continue;
    active.push({ source: state.source, price: state.lastPrice, lastTickAt: state.lastTickAt, weight });
  }

  if (active.length === 0) return null;

  const price = weightedMedian(active.map(({ price, weight }) => ({ value: price, weight })));

  const freshestTickAt = Math.max(...active.map(({ lastTickAt }) => lastTickAt));
  const freshness = computeFreshness(now, freshestTickAt, cfg.freshnessDecayMs);
  const agreement = computeAgreement(active.map(({ price }) => price));
  const coverage = computeCoverage(active.length, states.length);
  const confidence = computeConfidence(freshness, agreement, coverage);

  return { price, confidence, contributingSources: active.map(({ source }) => source) };
}
