/**
 * @file Synthetic-price generator — the pure function that produces
 * the next tick's price from the previous one.
 *
 * **Why a random walk and not a fixed price.** The mock has to look
 * "alive" so the dashboard's price-trend widget produces an
 * interesting line and so the aggregator's agreement factor sees
 * realistic movement. A flat price would mean perfect agreement with
 * any other source forever, which would mask agreement-degradation
 * scenarios entirely. The walk's drift is small per step (default
 * volatility 0.1%, see `DEFAULT_PRICE_VOLATILITY_PCT` in
 * `config/env.schema.ts`) so over a 250 ms interval the mock stays
 * close to its anchor — close enough to *agree* with Binance and
 * Coinbase at baseline, which is what makes the chaos demos work:
 * the operator can compare a healthy mock against the real sources
 * and see the agreement signal degrade when the mock goes stale.
 *
 * **Anchor + volatility choice.** Defaults are tuned to current spot:
 * `MOCK_BTC_ANCHOR_USD = 76_000`, `MOCK_ETH_ANCHOR_USD = 2_070`,
 * `MOCK_PRICE_VOLATILITY_PCT = 0.001`. The anchor is only used as
 * the *starting* price in `TickGeneratorService`'s constructor; from
 * there on out the walk is unanchored — there is no mean-reversion
 * term, so over long sessions the mock will drift away from the real
 * spot. That is fine for the demo: a long-running session is not the
 * target use case, and drift away from spot is itself a useful
 * agreement-degradation scenario for an operator to observe.
 *
 * **Determinism.** The RNG enters as a parameter (`rand: RandFn`), so
 * this function is pure: same `(prev, step)` in → same price out.
 * Tests pass `() => 0.5` for "no drift" or any deterministic
 * function for reproducible curves. Production passes `Math.random`
 * (see `tick-generator.service.ts`), so the *running* mock is not
 * deterministic — there is no seed wired today. If reproducibility
 * across runs is needed (e.g. for screenshots), wire a seeded PRNG
 * through `IngestorConfig` and pass it here.
 *
 * **Pure-function discipline.** This file imports only a type from
 * the contracts package — no Nest, no clock, no logger. That makes
 * it trivially testable without any of the surrounding service
 * scaffolding. CLAUDE.md rule 16 ("Domain layer is pure") strictly
 * applies to `aggregator`'s `domain/`, but the same discipline pays
 * off here for the same reason: a one-line unit test can sweep the
 * formula's behavior without spinning up NestJS.
 */
import type { Price } from '@price-oracle/contracts/primitives';

/**
 * Random-number generator returning a value in `[0, 1)`.
 *
 * Defaults to `Math.random` at the call site (`tick-generator.service.ts`),
 * but tests inject a deterministic function (often `() => 0.5` for a
 * neutral drift, `() => 0` or `() => 1` for the extreme swings).
 * Same pattern as `nextDelayMs` in `@price-oracle/ingestor-transport/backoff`.
 */
export type RandFn = () => number;

/**
 * Parameters for one step of the walk.
 *
 *  - `volatilityPct`: the maximum proportional change per step,
 *    expressed as a fraction (`0.001` = ±0.1%). Read from
 *    `IngestorConfig.priceVolatilityPct` in production.
 *  - `rand`: the RNG; see {@link RandFn}.
 *
 * Kept as a struct rather than two positional params so a future
 * fourth parameter (e.g. a mean-reversion target) can be added
 * without breaking call sites.
 */
export interface Step {
  readonly volatilityPct: number;
  readonly rand: RandFn;
}

/**
 * Compute the next price by perturbing the previous price by a
 * symmetric random delta in `[-volatilityPct, +volatilityPct]`.
 *
 * The math:
 *
 *   delta  = (rand() - 0.5) * 2 * volatilityPct
 *          // rand() ∈ [0,1) → delta ∈ [-volatilityPct, +volatilityPct)
 *   next   = prev * (1 + delta)
 *
 * Multiplicative (not additive) so the same `volatilityPct` works
 * for both BTC ($76k) and ETH ($2k) without per-asset tuning: a 0.1%
 * step is $76 on BTC and $2.07 on ETH, which is the right magnitude
 * in both cases.
 *
 * The function never returns a non-positive number under reasonable
 * `volatilityPct` values (anything well below 1.0), so the
 * `Price = z.number().positive()` boundary check in the published
 * tick will not reject it. If the operator ever sets
 * `MOCK_PRICE_VOLATILITY_PCT` to something pathological like 2.0,
 * the walk could theoretically cross zero — the env schema's
 * `nonnegative()` validator does not catch that, but it is so far
 * outside reasonable operator behavior that we accept the risk
 * rather than clamp here. The aggregator would reject a negative
 * price at its NATS-subscriber boundary anyway.
 *
 * @param prev The price of the previous tick (for the very first
 *             tick, this is the asset's anchor price).
 * @param step The volatility + RNG to apply.
 * @returns The next price, in the same asset's quote currency.
 */
export const nextPrice = (prev: Price, step: Step): Price => {
  // Map rand() ∈ [0, 1) to a symmetric delta ∈ [-volatilityPct, +volatilityPct).
  // The `* 2` exists so the half-open interval [0, 1) becomes the
  // half-open symmetric interval [-vol, +vol); without it the upper
  // bound would be vol/2 and the walk would be asymmetrically biased.
  const delta = (step.rand() - 0.5) * 2 * step.volatilityPct;
  return prev * (1 + delta);
};
