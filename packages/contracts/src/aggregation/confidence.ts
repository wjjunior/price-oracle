/**
 * @file Confidence formula — the single one-liner the entire system
 * is organized around.
 *
 *     confidence = freshness × agreement × coverage
 *
 * Each factor lives in `[0, 1]` and is computed by its own pure
 * function in this directory:
 *
 *  - `freshness`  — recency of the oldest contributing source.
 *  - `agreement`  — how close the active sources are to each other.
 *  - `coverage`   — fraction of configured sources actually active.
 *
 * Multiplying means **every** factor must be high for confidence to
 * be high. That is deliberate: fresh data from disagreeing sources is
 * just as untrustworthy as stale data from agreeing sources. The
 * multiplicative shape also means any one factor hitting zero pulls
 * the entire confidence to zero — so a single source going STALE
 * (its freshness contribution → 0) collapses confidence immediately,
 * even if the survivor is still fresh.
 *
 * The breaker FSM (`apps/aggregator/src/domain/breaker/`) is the
 * downstream consumer: it tracks the streak of ticks below the
 * confidence floor and trips when the streak exceeds
 * `BREAKER_TRIP_STREAK`.
 *
 * If you ever need to explain "why is confidence so low?" on the
 * dashboard, the answer is always one of these three factors — they
 * are independent and exposed in the SSE envelope so the operator
 * can see which one bottomed out.
 */
import type { Confidence } from '../primitives.js';

/**
 * Multiply the three normalized factors into a final confidence.
 *
 * All inputs are expected to be in `[0, 1]` (their respective
 * `compute*` functions guarantee this). The function does no
 * clamping of its own — if a caller passes out-of-range numbers,
 * the bug should surface at the Confidence schema validation
 * boundary, not be hidden by a silent clamp here.
 *
 * @param freshness  Output of `computeFreshness`.
 * @param agreement  Output of `computeAgreement`.
 * @param coverage   Output of `computeCoverage`.
 * @returns The confidence score, ready to feed the breaker.
 */
export const computeConfidence = (
  freshness: number,
  agreement: number,
  coverage: number,
): Confidence => freshness * agreement * coverage;
