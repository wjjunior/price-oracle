/**
 * @file Shared default for the breaker's confidence floor.
 *
 * Lives in the contracts package (not in aggregator config) because
 * it is part of the cross-service contract: the dashboard renders a
 * "breaker zone" shaded under this value on the price-trend chart,
 * and that visualization must match the floor the aggregator is
 * actually using. Lifting the constant here is the simple fix
 * documented in `decisions.md` (entry on the AI-review override) —
 * the alternative was a `/api/config` endpoint that would have been
 * runtime cycles to solve a static problem.
 *
 * The aggregator's Zod env schema (`orchestrator.config.ts`) uses
 * this as the default; operators can still override at boot via
 * `BREAKER_CONFIDENCE_FLOOR=<value>`. The dashboard imports the
 * constant directly — it does *not* know whether the operator
 * overrode the env var at runtime (a known limitation, also called
 * out in `decisions.md`).
 *
 * The chosen value (0.6) came from sensitivity walking, not theory:
 *  - one of three sources STALE → coverage 0.67 → confidence ≈ 0.66
 *    if freshness and agreement are perfect. So 0.6 sits *just*
 *    below the "one-source-down with everything else healthy" floor.
 *  - flipping to 0.7 (a typical demo override) makes that same
 *    scenario trip the breaker, which is the demo's most-watched
 *    behavior.
 */

/**
 * Default minimum aggregate confidence before the breaker trips.
 *
 * Override per-environment with `BREAKER_CONFIDENCE_FLOOR` if needed.
 * Range is `[0, 1]` (it gates a `Confidence` value).
 */
export const BREAKER_CONFIDENCE_FLOOR_DEFAULT = 0.6;
