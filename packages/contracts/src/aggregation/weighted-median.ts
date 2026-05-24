/**
 * @file Weighted-median price aggregator.
 *
 * Picks the *value* from a list of weighted samples such that half
 * of the total weight lies on each side. Used by the aggregator to
 * fold each source's last price (weighted by that source's freshness)
 * into a single published `AggregatePrice`.
 *
 * Why weighted median, not weighted mean:
 *
 *  - **Outlier resistance.** A single source publishing a wild price
 *    (a parse glitch, a delayed tick from a market-wide spike, an
 *    arithmetic bug in the adapter) does not pull the median the
 *    way it would pull the mean. The aggregate stays close to where
 *    the majority of weight sits.
 *
 *  - **Weight = trust.** We feed each sample its source's freshness
 *    as the weight. Stale-ish sources still contribute but get less
 *    say. A fully-stale source gets weight 0 and is filtered out
 *    entirely (see the `weight > 0` filter below).
 *
 * The algorithm follows the standard cumulative-weight definition:
 * sort by value, walk by weight, return the value at which the
 * running cumulative weight crosses half the total. The
 * tie-breaking case (`cumulative * 2 === totalWeight`) averages the
 * two straddling values — same convention as `numpy.median` for
 * even-length arrays. We use `cumulative * 2` rather than
 * `totalWeight / 2` to keep the comparison in integer/rational space
 * when the weights are integers — avoids the floating-point bin you
 * sometimes get when the weights are powers of 2 + an odd count.
 *
 * Production callers pass `Price` weights as freshness (`[0, 1]`) so
 * the integer-arithmetic argument is moot for them, but the property
 * tests use small integer weights where it matters.
 */
import type { Price } from '../primitives.js';

/**
 * One contributor to the weighted median.
 *
 *  - `value`:  the source's last price.
 *  - `weight`: how much that source's opinion should count for this
 *              tick. The aggregator uses the source's freshness
 *              factor; a STALE source has weight 0 and is excluded.
 *
 * Negative weights are rejected at the boundary (`weightedMedian`
 * throws). Zero weights are allowed and silently filtered.
 */
export type WeightedSample = { value: Price; weight: number };

/**
 * Compute the weighted median of a list of samples.
 *
 * @throws Error If any weight is negative — that is a programmer
 *               error, not a runtime degraded state, so we fail
 *               loudly rather than silently clamp.
 * @throws Error If every sample has weight 0 — there is no meaningful
 *               median to return, and downstream code expects a
 *               `Price`. Callers (the orchestrator) prevent this by
 *               not aggregating when no source is active.
 *
 * @param samples List of `{ value, weight }` pairs, any order.
 * @returns The price at which the cumulative weight crosses half of
 *          the total weight. If the cumulative weight lands exactly
 *          on the midpoint, returns the average of the two
 *          straddling values (even-length convention).
 */
export const weightedMedian = (samples: readonly WeightedSample[]): Price => {
  // Defensive validation: negative weights would invert the cumulative
  // walk and silently corrupt the result. Throw early.
  for (const sample of samples) {
    if (sample.weight < 0) {
      throw new Error('weightedMedian: weights must be non-negative');
    }
  }

  // Zero-weight samples have no say. Filter them out before sorting
  // so they don't waste cycles or pollute the cumulative walk.
  const contributing = samples.filter((s) => s.weight > 0);
  if (contributing.length === 0) {
    throw new Error('weightedMedian: at least one sample with positive weight is required');
  }

  // Sort by value (ascending) so we can walk the cumulative weight
  // from the low side and find the crossover.
  const sorted = [...contributing].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, s) => sum + s.weight, 0);

  let cumulative = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i]!.weight;
    const doubled = cumulative * 2;
    // Strictly past the midpoint: this is the median.
    if (doubled > totalWeight) return sorted[i]!.value;
    // Lands exactly on the midpoint with a "next" sample available:
    // average the two straddling values (even-length convention).
    if (doubled === totalWeight && i + 1 < sorted.length) {
      return (sorted[i]!.value + sorted[i + 1]!.value) / 2;
    }
  }

  // Defensive: with the early returns above we should never reach
  // here, but TypeScript needs a return. Take the last (largest)
  // value, which is the correct answer if floating-point drift kept
  // us strictly under the midpoint to the very end.
  return sorted.at(-1)!.value;
};
