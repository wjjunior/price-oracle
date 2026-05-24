/**
 * @file Per-source price-drift anomaly detector.
 *
 * **The job.** Each pulse, for each source that has a `lastPrice`,
 * answer: "is this source's price drifting too far from the
 * aggregate?" The detector is one of two layers of "something is
 * wrong" signal:
 *
 *  - The breaker (`breaker.ts`) is **aggregate-wide**: it suppresses
 *    publication when overall confidence falls below the floor.
 *  - The anomaly detector is **per-source**: it flags an individual
 *    source as drifting even when the aggregate is otherwise healthy,
 *    e.g. one exchange briefly publishing a bad price that the
 *    median resists.
 *
 * **What "drift" means.** Absolute percent deviation between a
 * source's last price and the aggregate price:
 *
 *     deviationRatio = |lastPrice - aggregatePrice| / aggregatePrice * 100
 *
 * Above `cfg.driftTolerance` (percent), the tick counts as drifting.
 * The orchestrator owns the streak: only after
 * `cfg.streakLength` consecutive drifting pulses does an
 * `AnomalyDetected` audit event fire. This is the standard "filter
 * out single-tick noise" pattern.
 *
 * **Edge-triggered (PRO-45).** The orchestrator emits exactly one
 * `AnomalyDetected` event per *transition* into the anomalous state,
 * not one per drifting tick. Without that, a sustained drift would
 * spam the audit feed and the dashboard. The orchestrator's
 * `detectAnomalies` function holds the per-source streak counter and
 * uses `prevStreak >= streakLength` as the dedup guard.
 *
 * This file's only job is the math — the streak / event / edge-trigger
 * bookkeeping is in `application/orchestrator.ts::detectAnomalies`.
 * Keeping the math pure is what lets `anomaly-detector.property.test.ts`
 * blast `fast-check` arbitraries through the formula and prove
 * invariants (symmetry, monotonicity in the deviation, no NaN, etc.).
 *
 * CLAUDE.md rule 16 — pure domain. CLAUDE.md operational quirks →
 * "Anomaly detector is edge-triggered."
 */
import type { AnomalyConfig, SourceState } from './types.js';
import type { Price } from '@price-oracle/contracts/primitives';

/**
 * Scale factor to convert the absolute relative deviation
 * (`|d| / a` in `[0, ∞)`) into a percentage matching the units of
 * `cfg.driftTolerance`. Named so call-site arithmetic stays
 * self-documenting (CLAUDE.md rule 2).
 */
const PERCENT = 100;

/**
 * One detection's output:
 *
 *  - `triggered`:      did this single observation exceed the
 *                      tolerance? The orchestrator's streak logic
 *                      uses this; the audit event is emitted only on
 *                      the streak transition.
 *  - `deviationRatio`: the actual percent deviation. Surfaced in the
 *                      `AnomalyDetected.value` field so dashboards and
 *                      reviewers can see how big the drift was, not
 *                      just that it exceeded the threshold.
 */
export type AnomalyResult = {
  readonly triggered: boolean;
  readonly deviationRatio: number;
};

/**
 * Compute drift for one source against the current aggregate price.
 *
 * Edge cases:
 *  - `state.lastPrice === null` (the source has never ticked or is
 *    in pre-tick STALE) → `triggered=false, deviationRatio=0`. There
 *    is no opinion to compare; we cannot call it anomalous.
 *  - `aggregatePrice` is guaranteed positive by `Price` (Zod
 *    `z.number().positive()` in `primitives.ts`), so the division is
 *    safe. The orchestrator only calls this function when the
 *    aggregate produced a value at all, i.e. `aggregate(...) !== null`.
 *
 * Symmetry: the absolute value means a source $1 above the median
 * and a source $1 below it both produce the same `deviationRatio`.
 * That is intentional — drift in either direction is equally
 * informative.
 *
 * @param state            The source's current state. We use
 *                         `lastPrice` only; other fields are not the
 *                         detector's concern.
 * @param aggregatePrice   The aggregate price *this* pulse produced.
 * @param cfg              Drift tolerance (percent) and the streak
 *                         length the orchestrator enforces.
 *                         `streakLength` is *not* consulted here —
 *                         only the orchestrator reads it.
 */
export function detectAnomaly(
  state: SourceState,
  aggregatePrice: Price,
  cfg: AnomalyConfig,
): AnomalyResult {
  if (state.lastPrice === null) return { triggered: false, deviationRatio: 0 };
  const deviationRatio = (Math.abs(state.lastPrice - aggregatePrice) / aggregatePrice) * PERCENT;
  return { triggered: deviationRatio > cfg.driftTolerance, deviationRatio };
}
