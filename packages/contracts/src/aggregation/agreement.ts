/**
 * @file Agreement factor — one of the three multipliers of the
 * confidence formula `confidence = freshness * agreement * coverage`.
 *
 * Agreement answers: "how close are the active sources' prices to
 * each other right now?" Two healthy sources reporting $76,400 and
 * $76,402 agree; two reporting $76,400 and $80,000 disagree and the
 * aggregate confidence should reflect that.
 *
 * The metric is `1 - coefficient_of_variation` (the standard deviation
 * normalized by the mean), clamped at 0. That choice has three
 * properties worth knowing:
 *
 *  - **Scale-invariant.** A $2 spread on BTC ($76k) is a smaller
 *    disagreement than a $2 spread on a $20 altcoin. Dividing the
 *    standard deviation by the mean expresses "how spread out as a
 *    fraction of the level" — the same formula works for any asset
 *    without per-asset tuning.
 *
 *  - **Saturates at 0.** A single huge outlier (e.g. a malformed
 *    payload that slipped past the schema with a value of $0.01)
 *    will push the coefficient above 1, and the `Math.max(0, ...)`
 *    clamps the result. The breaker then trips on confidence, not
 *    on the bad price itself — the weighted median resists the
 *    outlier and agreement degrades.
 *
 *  - **Two sources required for non-trivial signal.** With one source
 *    we cannot measure disagreement; the function returns 1 by
 *    convention, and the burden of suppressing single-source
 *    aggregates falls on the coverage factor instead.
 *
 * Note that the input is the prices of the *active* sources only —
 * the orchestrator excludes STALE sources before calling.
 */
import type { Price } from '../primitives.js';

/**
 * Compute the agreement factor for a tick's contributing prices.
 *
 * @param activePrices Last-known prices of every active source for
 *                     the asset, in any order. Empty array means
 *                     nothing to compare; one-element array means
 *                     trivial agreement (returns 1).
 * @returns A number in `[0, 1]`. 1 means perfect agreement (all
 *          prices identical, or only one source); 0 means the
 *          coefficient of variation hit or exceeded 1 (i.e. the
 *          standard deviation equals or exceeds the mean — a wild
 *          spread, almost certainly a bad source).
 */
export const computeAgreement = (activePrices: readonly Price[]): number => {
  // Empty: no signal at all. Coverage will be 0 too so confidence
  // ends up 0 — the only reason agreement is also 0 here is to keep
  // the function total.
  if (activePrices.length === 0) return 0;

  // Single source: we cannot define disagreement with one observation.
  // Return 1 and let coverage carry the "only one source" penalty.
  if (activePrices.length === 1) return 1;

  // Single-pass min/max/sum so we don't iterate the array three times.
  let min = activePrices[0]!;
  let max = min;
  let sum = 0;
  for (const price of activePrices) {
    if (price < min) min = price;
    if (price > max) max = price;
    sum += price;
  }
  // Exact agreement — early-out before the variance math. Common in
  // tests with synthetic data and useful as a defensive optimization.
  if (min === max) return 1;

  const mean = sum / activePrices.length;

  // Second pass: accumulate squared deviations for the population
  // variance (we use N, not N-1, because we treat the active set as
  // the entire population for this tick, not a sample).
  let squaredDeviationSum = 0;
  for (const price of activePrices) {
    squaredDeviationSum += (price - mean) ** 2;
  }
  const coefficientOfVariation = Math.sqrt(squaredDeviationSum / activePrices.length) / mean;

  // 1 - CV gives "how close to identical, as a fraction". CV > 1
  // means the spread is wider than the level — pathological, clamp.
  return Math.max(0, 1 - coefficientOfVariation);
};
