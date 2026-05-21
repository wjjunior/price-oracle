import type {
  AggregatePrice as AggregatePriceContract,
  SourceState as SourceStateContract,
  Tick as TickContract,
} from '@price-oracle/contracts/events';
import type { Confidence, Millis, SourceId } from '@price-oracle/contracts/primitives';

export type { BreakerState } from '@price-oracle/contracts/primitives';

export type Tick = Readonly<TickContract>;
export type SourceState = Readonly<SourceStateContract>;
export type AggregatePrice = Readonly<Omit<AggregatePriceContract, 'contributingSources'>> & {
  readonly contributingSources: readonly SourceId[];
};

export type Thresholds = {
  readonly freshnessDecayMs: Millis;
  readonly degradedAfterMs: Millis;
  readonly staleAfterMs: Millis;
  readonly healthHysteresisStreak: number;
};

export type BreakerConfig = {
  readonly confidenceFloor: Confidence;
  readonly tripStreak: number;
  readonly recoveryWindowMs: Millis;
  readonly halfOpenProbeStreak: number;
};

export type AnomalyConfig = {
  readonly driftTolerance: number;
  readonly streakLength: number;
};
