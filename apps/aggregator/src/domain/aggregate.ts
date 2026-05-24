/**
 * @file Per-pulse aggregation: fold N source states into one
 * `AggregateResult` (price + confidence + contributing source list).
 *
 * **What this file is.** The connective tissue between the source FSM
 * and the cross-package aggregation utilities. It is *not* the place
 * where the math lives — every actual formula
 * (`computeAgreement`, `computeCoverage`, `computeConfidence`,
 * `computeFreshness`, `weightedMedian`) is imported from
 * `@price-oracle/contracts/aggregation`. The file headers there
 * (especially `weighted-median.ts` and `agreement.ts`) carry the
 * "why this math" reasoning, including outlier resistance and the
 * coefficient-of-variation choice.
 *
 * **Why the math lives in `@price-oracle/contracts`, not here.** The
 * confidence formula is part of the contract surface — the dashboard
 * applies the same factor decomposition for its tooltips, and the
 * stub diagnose adapter cites confidence percentages. Sharing the
 * pure utilities through a workspace package keeps every consumer on
 * the same definition without round-tripping over HTTP.
 *
 * **What this file owns.** The composition order:
 *
 *   1. Compute each source's weight via `perSourceHealthScore`
 *      (which short-circuits STALE / never-ticked sources to 0).
 *   2. Keep only sources with positive weight and a non-null last
 *      price — these are the *active* sources for this pulse.
 *   3. If nothing is active, return `null` (the orchestrator treats a
 *      null result as "no aggregate to publish this pulse").
 *   4. Run the weighted median over active prices to get the
 *      aggregate price (outlier-resistant; see weighted-median.ts).
 *   5. Compute the three confidence factors:
 *        - **freshness**: from the *freshest* active tick's age.
 *          The aggregate is only as old as its newest contributor.
 *        - **agreement**: coefficient-of-variation-based; clamps at 0
 *          for wild disagreement.
 *        - **coverage**: active / total source count (so dropping
 *          from 3/3 to 1/3 sources halves coverage even if those
 *          remaining sources are perfectly fresh and agreeing).
 *   6. Multiply into a single confidence value (the published
 *      formula: `freshness * agreement * coverage`).
 *
 * **Pure** — no `Date.now()`, no I/O, no NestJS. `now: Millis` enters
 * as a parameter. CLAUDE.md rule 16.
 *
 * Cross-references:
 *  - `@price-oracle/contracts/aggregation/confidence.ts`: the
 *    three-factor formula and the reasoning behind it.
 *  - `@price-oracle/contracts/aggregation/weighted-median.ts`: why we
 *    pick a median, not a mean.
 *  - `@price-oracle/contracts/aggregation/agreement.ts`: the
 *    coefficient-of-variation rationale.
 *  - `aggregate.property.test.ts`: invariants — `confidence ∈ [0, 1]`,
 *    aggregate price within `[min, max]` of contributors, empty input
 *    → null, etc.
 *  - CLAUDE.md operational quirks → "Confidence formula constants
 *    come from sensitivity analysis."
 */
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

/**
 * What `aggregate` returns when at least one source is active. The
 * orchestrator wraps this into the `AggregatePrice` contract by
 * adding `asset` and `computedAt`, which are pulse-scope, not
 * source-scope, and therefore not the math's concern.
 */
export type AggregateResult = {
  readonly price: Price;
  readonly confidence: Confidence;
  readonly contributingSources: readonly SourceId[];
};

/**
 * Internal record for one active source. Built inside `aggregate` and
 * never escapes — collects the four fields the rest of the function
 * needs in one shape so the subsequent operations stay readable.
 */
type ActiveSource = {
  readonly source: SourceId;
  readonly price: Price;
  readonly lastTickAt: Millis;
  readonly weight: number;
};

/**
 * Fold N source states into one aggregate for this pulse.
 *
 * @param states All known source states for one asset, in any order.
 *               The orchestrator passes `[...runtime.sources.values()]`.
 * @param now    Pulse wall-clock millis. Drives freshness decay and
 *               (indirectly, via `perSourceHealthScore`) the
 *               classification of who counts as "active".
 * @param cfg    Source-FSM thresholds; reused here for freshness math.
 * @returns      `null` if no source is active this pulse — the
 *               orchestrator treats this as "publish nothing". The
 *               confidence stays at 0 from the orchestrator's
 *               perspective, which feeds the breaker.
 */
export function aggregate(
  states: readonly SourceState[],
  now: Millis,
  cfg: Thresholds,
): AggregateResult | null {
  // Step 1+2: weight each source, keep the active ones. STALE
  // sources are silently dropped (their `perSourceHealthScore`
  // returns 0). The defensive `lastPrice === null` / `lastTickAt ===
  // null` checks cover any pathological combination the FSM should
  // never produce but TypeScript still requires us to narrow.
  const active: ActiveSource[] = [];
  for (const state of states) {
    const weight = perSourceHealthScore(state, now, cfg);
    if (weight <= 0 || state.lastPrice === null || state.lastTickAt === null) continue;
    active.push({ source: state.source, price: state.lastPrice, lastTickAt: state.lastTickAt, weight });
  }

  // Step 3: no active source means no aggregate. The orchestrator
  // will still advance the breaker on confidence=0.
  if (active.length === 0) return null;

  // Step 4: weighted median over active prices. Outlier-resistant by
  // design — a single misbehaving source cannot pull the result the
  // way it would pull a mean. See weighted-median.ts.
  const price = weightedMedian(active.map(({ price, weight }) => ({ value: price, weight })));

  // Step 5a: freshness uses the *freshest* tick across active sources.
  // The intuition: an aggregate is at least as fresh as its newest
  // contributor; one stale-ish source should not penalize the whole
  // pulse if another source just delivered a tick.
  const freshestTickAt = Math.max(...active.map(({ lastTickAt }) => lastTickAt));
  const freshness = computeFreshness(now, freshestTickAt, cfg.freshnessDecayMs);
  // Step 5b: agreement on prices alone — the coefficient-of-variation
  // formula in `@price-oracle/contracts/aggregation/agreement.ts`.
  const agreement = computeAgreement(active.map(({ price }) => price));
  // Step 5c: coverage = active / total. Dropping a source halves the
  // factor regardless of how fresh the others are; this is what
  // penalizes the "only one source left" situation that agreement
  // cannot detect on its own.
  const coverage = computeCoverage(active.length, states.length);
  // Step 6: multiply. The pure formula is `freshness * agreement *
  // coverage`; all three live in `[0, 1]` so the product does too.
  const confidence = computeConfidence(freshness, agreement, coverage);

  return { price, confidence, contributingSources: active.map(({ source }) => source) };
}
