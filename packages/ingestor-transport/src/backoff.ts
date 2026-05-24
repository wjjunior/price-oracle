/**
 * @file Exponential-backoff-with-jitter utility shared across the three
 * ingestor apps (binance, coinbase, mock).
 *
 * Used on the **reconnect path** of any external long-lived connection
 * an ingestor owns — primarily the exchange WebSocket. When a connection
 * drops, the ingestor schedules its next reconnect attempt using the
 * delay returned by `nextDelayMs(attempt)`. See for example
 * `apps/ingestor-binance/src/binance/binance.service.ts` (the
 * `scheduleReconnect` path, around the `nextDelayMs` call), and the
 * matching site in `apps/ingestor-coinbase/`.
 *
 * Why it lives here, in `@price-oracle/ingestor-transport`, instead of
 * being copy-pasted into each ingestor app: PRO-48 extracted the
 * transport adapter so all three ingestors share one implementation of
 * NATS publishing and reconnect timing. That gives us one place to tune
 * the curve and one place to test it (`backoff.test.ts`).
 *
 * The function is intentionally **pure**: no `Date.now()`, no
 * `Math.random()` baked in — both `attempt` and the RNG come in as
 * parameters. That is what makes the unit tests deterministic, and it
 * follows CLAUDE.md rule 16 ("Domain layer is pure") in spirit even
 * though this lives in a package rather than under `domain/`.
 *
 * Shape of the curve, for intuition:
 *
 *  - `attempt = 0` → `baseMs` (1 s by default), ±20% jitter.
 *  - Each subsequent attempt doubles the base, capped at `maxMs` (30 s).
 *  - Jitter is symmetric around the capped value (`±jitterRatio * capped`)
 *    so the *expected* delay equals the deterministic exponential curve;
 *    jitter only prevents the thundering-herd problem when many clients
 *    reconnect to the same broker at the same instant.
 *
 * CLAUDE.md's logging-semantics rule (rule 20) classifies "NATS reconnect
 * attempt" as a `warn` event — the call sites in the ingestor services
 * log at `warn` when they schedule the next attempt and include the
 * delay returned by this function.
 */

/**
 * Initial delay used at `attempt = 0` (with no jitter). Doubles each
 * subsequent attempt until clipped by `DEFAULT_BACKOFF_MAX_MS`.
 *
 * One second was chosen so that a single transient blip (broker
 * restart, momentary network glitch) recovers quickly without an
 * operator noticing, while still being long enough that we don't
 * hammer the broker on a genuine outage.
 */
export const DEFAULT_BACKOFF_BASE_MS = 1_000;

/**
 * Hard cap on the delay between attempts. After roughly five doublings
 * from `DEFAULT_BACKOFF_BASE_MS` (1 s → 2 → 4 → 8 → 16 → capped at 30),
 * subsequent attempts all wait `maxMs ± jitter`.
 *
 * 30 s keeps the worst-case recovery latency bounded — once the broker
 * comes back, every ingestor will reconnect within roughly a minute.
 */
export const DEFAULT_BACKOFF_MAX_MS = 30_000;

/**
 * Fraction of the deterministic delay that is added or subtracted as
 * jitter. `0.2` means the actual delay sits in `[0.8x, 1.2x]` of the
 * exponential value.
 *
 * Jitter is the standard mitigation for the thundering-herd problem:
 * if every ingestor reconnects on the same schedule after a broker
 * outage, they all hit the broker simultaneously the moment it comes
 * back. ±20% is enough to smear those reconnects across a window
 * without making the curve unrecognizable in logs.
 */
export const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;

/**
 * Tunable parameters for {@link nextDelayMs}. Kept as a plain object
 * (rather than positional args) so a caller can override one knob
 * without spelling the other two, and so the defaults can be exported
 * as a single value (`DEFAULT_BACKOFF`).
 */
export type BackoffConfig = {
  baseMs: number;
  maxMs: number;
  jitterRatio: number;
};

/**
 * Production defaults. Imported by the ingestor services as the
 * implicit second argument to `nextDelayMs`; tests pass a custom
 * `BackoffConfig` to exercise edge cases (e.g. a very small `maxMs`
 * to verify capping).
 */
export const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: DEFAULT_BACKOFF_BASE_MS,
  maxMs: DEFAULT_BACKOFF_MAX_MS,
  jitterRatio: DEFAULT_BACKOFF_JITTER_RATIO,
};

/**
 * Compute the delay (in ms) to wait before the next reconnect attempt.
 *
 * The formula is **exponential with full symmetric jitter, hard-capped
 * at `maxMs`**:
 *
 *   capped     = min(baseMs * 2^attempt, maxMs)
 *   jittered   = capped + capped * jitterRatio * (random()*2 - 1)
 *   result     = clamp(jittered, 0, maxMs)
 *
 * The final `clamp(0, maxMs)` matters: with `jitterRatio > 0` the
 * upper jitter swing can push past `maxMs`, and we want the cap to
 * really be a cap (operators expect "max 30 s" to mean 30 s, not
 * 36 s). The lower clamp at 0 is defensive — with `jitterRatio < 1`
 * the negative swing never actually reaches 0, but the clamp keeps
 * the property "delay is non-negative" robust to misconfiguration.
 *
 * Pass a deterministic `random` in tests (e.g. `() => 0.5` to mean
 * "no jitter", `() => 0` for the lower bound, `() => 1` for the
 * upper). See `backoff.test.ts` for the table of cases this function
 * is verified against.
 *
 * @param attempt Zero-based attempt counter. Negative values are
 *                treated as 0 — call sites that store "attempt - 1"
 *                so they can decrement before retry should not have
 *                to special-case the very first run.
 * @param config  Tunables; defaults to `DEFAULT_BACKOFF`.
 * @param random  RNG returning `[0, 1)`. Defaults to `Math.random`.
 *                Inject a fixed function in tests so the result is
 *                reproducible.
 * @returns Delay in ms, in `[0, config.maxMs]`.
 */
export function nextDelayMs(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  // Negative attempts come from call sites that pre-decrement (see
  // binance.service.ts: `nextDelayMs(this.attempt - 1)`). Treat them
  // as 0 so the first attempt always uses `baseMs`.
  const safeAttempt = Math.max(0, attempt);

  // Exponential growth: 1s, 2s, 4s, 8s, ...
  const exponential = config.baseMs * 2 ** safeAttempt;

  // Hard cap *before* jitter so the deterministic curve plateaus at
  // exactly `maxMs`; jitter then swings symmetrically around that
  // plateau, not around an ever-growing exponential.
  const capped = Math.min(exponential, config.maxMs);

  // Map `random()` from `[0, 1)` to `[-1, 1)`, then scale by the
  // jitter ratio. Result is the additive offset, symmetric around 0.
  const jitter = capped * config.jitterRatio * (random() * 2 - 1);

  // Final clamp: ensure the upper-jitter swing never pushes past the
  // documented cap, and ensure the result is never negative (defensive
  // against pathological configs like jitterRatio >= 1).
  return Math.min(config.maxMs, Math.max(0, capped + jitter));
}
