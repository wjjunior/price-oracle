/**
 * @file Freshness factor — one of the three multipliers of the
 * confidence formula `confidence = freshness * agreement * coverage`
 * (see `./confidence.ts`).
 *
 * Freshness answers: "how recently did we hear from the oldest
 * contributing source?" The slowest source ages the whole confidence
 * — that is intentional, because a price built from a 12-hour-old
 * tick is not trustworthy regardless of how many fresh sources are
 * agreeing with it.
 *
 * The curve is a simple linear ramp from 1 (just heard from them) to
 * 0 (we have not heard from them in `decayMs`). The decay constant
 * is provided by the caller because:
 *  - the aggregator's `FRESHNESS_DECAY_MS` env var owns the production
 *    value (default 12s),
 *  - tests want to inject smaller values,
 *  - the function stays pure (no env access here).
 *
 * A linear ramp was chosen over exponential decay because the breaker
 * runs anti-flapping streak logic on top — exponential decay added no
 * value once that was in place and made the threshold harder to
 * explain to the operator. See `decisions.md` for the sensitivity
 * analysis trade-off.
 */
import type { Millis } from '../primitives.js';

/**
 * Compute the freshness factor for one source's last tick.
 *
 * @param now         Current time, in ms. Always passed by the caller
 *                    so the domain stays pure (no `Date.now()` here).
 * @param lastTickAt  Timestamp of the source's most recent tick.
 * @param decayMs     How long it takes for freshness to fall to 0.
 *                    Comes from `FRESHNESS_DECAY_MS` in the aggregator
 *                    config in production.
 * @returns A number in `[0, 1]`. `1` means we heard from the source
 *          right now; `0` means we have not heard for at least
 *          `decayMs`; in between it ramps linearly.
 *
 * Edge cases worth knowing:
 *  - `age <= 0` (tick from the future, e.g. clock skew between ingestor
 *    and aggregator) is treated as fresh; we don't want negative ages
 *    leaking into a multiplication.
 *  - `age >= decayMs` is treated as fully stale; the source's last
 *    price still exists, but its contribution to confidence is zero.
 */
export const computeFreshness = (now: Millis, lastTickAt: Millis, decayMs: Millis): number => {
  const age = now - lastTickAt;
  if (age <= 0) return 1;
  if (age >= decayMs) return 0;
  return 1 - age / decayMs;
};
