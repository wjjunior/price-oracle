/**
 * @file Coverage factor — one of the three multipliers of the
 * confidence formula `confidence = freshness * agreement * coverage`.
 *
 * Coverage answers: "what fraction of the sources we configured are
 * actually contributing right now?" If we set up the aggregator with
 * Binance + Coinbase + mock and only Binance is publishing, coverage
 * is 1/3. Multiplying that into confidence means a single-source
 * aggregate can never look as trustworthy as a fully-covered one,
 * regardless of how fresh or agreeing that one source is.
 *
 * The function is intentionally one of the smallest in the codebase
 * (5 lines) — its job is to express the rule "exactly 1 when fully
 * covered, exactly 0 when nothing contributes" without any clever
 * weighting. Sources that are STALE never reach this function: the
 * orchestrator excludes them from `activeCount` before calling.
 */

/**
 * Compute the coverage factor.
 *
 * @param activeCount Number of sources currently considered active
 *                    (HEALTHY or DEGRADED with a non-null lastPrice).
 *                    STALE sources are filtered out by the caller.
 * @param totalCount  Number of sources the aggregator was configured
 *                    to expect for this asset (e.g. 3 when
 *                    `AGGREGATOR_SOURCES=binance,coinbase,mock`).
 * @returns A number in `[0, 1]`. Boundary cases:
 *           - `0` when there are no active sources, or when total is
 *             non-positive (defensive; should not happen in prod).
 *           - `1` when every configured source is active. Also `1`
 *             when active exceeds total (also defensive — should not
 *             happen but we don't want to return > 1 and break the
 *             Confidence schema downstream).
 *           - the simple ratio otherwise.
 *
 * Domain intuition: with three configured sources, killing one drops
 * coverage to ~0.667. Combined with a breaker floor of 0.7 (the demo
 * setting), that single drop is by itself enough to trip the breaker.
 * Try it on the dashboard with `disconnect` to see the chain.
 */
export const computeCoverage = (activeCount: number, totalCount: number): number => {
  if (totalCount <= 0 || activeCount <= 0) return 0;
  if (activeCount >= totalCount) return 1;
  return activeCount / totalCount;
};
