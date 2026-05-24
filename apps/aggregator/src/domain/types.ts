/**
 * @file Domain-internal type aliases for the aggregator.
 *
 * This file is the **type vocabulary** of the aggregator's domain. It
 * does three things and only three things:
 *
 *  1. Re-exports the cross-service contract types from
 *     `@price-oracle/contracts` (`Tick`, `SourceState`,
 *     `AggregatePrice`) under `Readonly<...>` wrappers, signalling
 *     "the domain treats these as immutable". CLAUDE.md rule 13: the
 *     Zod-inferred type *is* the domain type — we do not introduce a
 *     parallel domain model when the contract shape already fits.
 *
 *  2. Re-exports `BreakerState` from primitives so domain code can
 *     import it from one local path (`./types.js`) without reaching
 *     across the package boundary on every file.
 *
 *  3. Declares the three pure-domain *configuration shapes*:
 *     `Thresholds`, `BreakerConfig`, `AnomalyConfig`. These are read
 *     by the FSMs and the confidence/aggregate functions; they are
 *     constructed at composition time from env vars in
 *     `interface/orchestrator.config.ts`.
 *
 * The `AggregatePrice` alias overrides one field: the contract's
 * `contributingSources` is a mutable array, but inside the domain we
 * want every value to be deeply read-only so a buggy mutation fails at
 * compile time. The orchestrator and the SSE controller spread back
 * into a mutable array exactly at the boundary where the value leaves
 * the domain (see `snapshot.controller.ts::toResponseAggregate` and
 * the SSE emit path in `orchestrator.ts::pulseAsset`).
 *
 * CLAUDE.md rule 16 — "domain is pure" — applies to this file: no
 * imports of NestJS, NATS, Mongo, or anything I/O. The types referenced
 * here all live in `@price-oracle/contracts` (pure schemas), which is
 * the only dependency the domain layer is allowed to take on.
 */
import type {
  AggregatePrice as AggregatePriceContract,
  SourceState as SourceStateContract,
  Tick as TickContract,
} from '@price-oracle/contracts/events';
import type { Confidence, Millis, SourceId } from '@price-oracle/contracts/primitives';

export type { BreakerState } from '@price-oracle/contracts/primitives';

/**
 * One observation from a source for a single asset. Comes off the
 * NATS subscriber after `TickSchema` validation (see
 * `infrastructure/nats-source-stream.ts`). `Readonly<...>` because the
 * domain never mutates an incoming tick — it folds it into a new
 * `SourceState` via `updateSourceState` and discards the input.
 */
export type Tick = Readonly<TickContract>;

/**
 * Per-(asset, source) state the FSM holds between ticks. Fields:
 *
 *  - `health`:        the FSM's current public output (HEALTHY / DEGRADED / STALE).
 *  - `lastTickAt`:    last observed `receivedAt`, `null` until the
 *                     first tick arrives. Drives freshness decay and
 *                     classifies the candidate health.
 *  - `lastPrice`:     last observed price; weighted into the median
 *                     when this source is active.
 *  - `pendingHealth`: candidate health the FSM is currently considering
 *                     promoting to. Hysteresis lives here — see
 *                     `source-state.ts`.
 *  - `pendingStreak`: how many consecutive observations have agreed
 *                     with `pendingHealth`. Once it crosses
 *                     `healthHysteresisStreak`, the FSM commits.
 *
 * `Readonly<...>` again: every transition produces a *new* state
 * object, never mutates in place.
 */
export type SourceState = Readonly<SourceStateContract>;

/**
 * Domain-internal view of an aggregate price. Identical to the
 * contract shape except `contributingSources` is `readonly SourceId[]`
 * — see the file header for why. The SSE/HTTP boundary copies into a
 * mutable array exactly once.
 */
export type AggregatePrice = Readonly<Omit<AggregatePriceContract, 'contributingSources'>> & {
  readonly contributingSources: readonly SourceId[];
};

/**
 * Time and hysteresis knobs the source FSM consults.
 *
 *  - `freshnessDecayMs`:       half-life-ish window used by the
 *                              freshness factor (`computeFreshness` in
 *                              `@price-oracle/contracts/aggregation`).
 *                              Older ticks have lower weight in the
 *                              weighted-median aggregation.
 *  - `degradedAfterMs`:        a source whose last tick is older than
 *                              this is classified DEGRADED.
 *  - `staleAfterMs`:           older than this → STALE (excluded from
 *                              the aggregate).
 *  - `healthHysteresisStreak`: consecutive observations of the new
 *                              candidate health required before the
 *                              FSM commits. Prevents flapping.
 *
 * Defaults and bound checks live in `interface/orchestrator.config.ts`
 * (which also enforces `DEGRADED_AFTER_MS <= STALE_AFTER_MS <=
 * FRESHNESS_DECAY_MS` so a DEGRADED source never reads zero freshness).
 */
export type Thresholds = {
  readonly freshnessDecayMs: Millis;
  readonly degradedAfterMs: Millis;
  readonly staleAfterMs: Millis;
  readonly healthHysteresisStreak: number;
};

/**
 * Per-asset circuit-breaker knobs (see `domain/breaker.ts`):
 *
 *  - `confidenceFloor`:     "below this" counts as a bad pulse.
 *  - `tripStreak`:          how many consecutive bad pulses CLOSED →
 *                           OPEN requires.
 *  - `recoveryWindowMs`:    after OPEN, this much wall-clock must pass
 *                           before we accept HALF_OPEN probes.
 *  - `halfOpenProbeStreak`: how many consecutive good probes HALF_OPEN
 *                           → CLOSED requires.
 *
 * The two streaks are deliberately *different* — closing requires more
 * evidence than tripping, by design (CLAUDE.md operational quirks on
 * breaker tuning).
 */
export type BreakerConfig = {
  readonly confidenceFloor: Confidence;
  readonly tripStreak: number;
  readonly recoveryWindowMs: Millis;
  readonly halfOpenProbeStreak: number;
};

/**
 * Knobs for the cross-source drift anomaly detector
 * (`domain/anomaly-detector.ts`):
 *
 *  - `driftTolerance`: percentage spread (a source vs the aggregate
 *                      price) above which a tick counts as drifting.
 *  - `streakLength`:   consecutive drifting ticks required before an
 *                      `AnomalyDetected` audit event fires.
 *
 * The detector is **edge-triggered** (PRO-45): only the *transition*
 * into the anomalous state emits an event. See the anomaly streak
 * bookkeeping in the orchestrator's `detectAnomalies`.
 */
export type AnomalyConfig = {
  readonly driftTolerance: number;
  readonly streakLength: number;
};
