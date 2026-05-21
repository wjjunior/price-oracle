import type {
  AggregatePrice as AggregatePriceContract,
  SourceState as SourceStateContract,
  Tick as TickContract,
} from '@price-oracle/contracts/events';
import type { Confidence, Millis } from '@price-oracle/contracts/primitives';

export type { BreakerState } from '@price-oracle/contracts/primitives';

export type Tick = Readonly<TickContract>;
export type SourceState = Readonly<SourceStateContract>;
export type AggregatePrice = Readonly<AggregatePriceContract>;

export type Thresholds = {
  readonly freshnessDecayMs: Millis;
  readonly degradedAfterMs: Millis;
  readonly staleAfterMs: Millis;
  readonly healthHysteresisStreak: number;
};

export type BreakerConfig = {
  readonly confidenceFloor: Confidence;
  readonly openWindowMs: Millis;
  readonly recoveryWindowMs: Millis;
  readonly halfOpenProbeStreak: number;
};

export type AnomalyConfig = {
  readonly driftTolerance: number;
  readonly streakLength: number;
};
