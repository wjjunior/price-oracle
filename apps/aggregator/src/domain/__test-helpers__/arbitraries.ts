/**
 * @file `fast-check` arbitraries for the aggregator's domain.
 *
 * **Why this file exists.** The aggregator's domain (`source-state.ts`,
 * `breaker.ts`, `aggregate.ts`, `anomaly-detector.ts`) is pure
 * (CLAUDE.md rule 16: no I/O, no `Date.now()`, no Promises), which
 * makes it a clean property-test target. The property tests under
 * `*.property.test.ts` blast millions of input combinations through
 * the FSMs and the confidence formula to prove **invariants** that
 * example-based tests cannot:
 *
 *  - Source FSM never flaps (`source-state.property.test.ts`).
 *  - Breaker recovery requires a streak (`breaker.property.test.ts`).
 *  - Confidence is always in `[0, 1]` (`aggregate.property.test.ts`).
 *  - Per-asset BTC/ETH isolation: an ETH-only tick never mutates the
 *    BTC slice (`per-asset-isolation.property.test.ts`).
 *
 * **What lives here.** Arbitraries reusable across all of those
 * tests: enum constants from `@price-oracle/contracts/primitives`,
 * the domain types (`Tick`, `SourceState`, `Thresholds`,
 * `BreakerConfig`), and tuned numeric ranges that mirror real
 * operational values.
 *
 * **Why these specific bounds.** The numeric arbitraries
 * (`arbMillis`, `arbPrice`, `arbConfidence`) are clamped to ranges
 * that:
 *  - exercise the same orders of magnitude as production (BTC at
 *    ~$76k → `arbPrice` up to `10^9`, comfortably wide),
 *  - avoid degenerate inputs that would mask real bugs (no `NaN`, no
 *    `Infinity` — `noNaN: true, noDefaultInfinity: true`),
 *  - keep shrinkers fast — `fast-check` shrinks failing inputs toward
 *    minimal counter-examples; unbounded ranges make that slow and
 *    can produce un-diagnosable failures.
 *
 * The `arbThresholds` / `arbBreakerConfig` records use small-enough
 * windows (`max: 60_000` ms) that property tests can simulate
 * realistic timelines in a handful of FSM steps without integer
 * overflow risk.
 *
 * **`__test-helpers__` naming.** The double-underscore convention
 * keeps Vitest from collecting this file as a suite (it has no
 * `describe` / `it`) and signals "support code, not behavior" to the
 * reader.
 *
 * Cross-references:
 *  - `decisions.md` Entry 3 — the hexagonal hybrid is what earns the
 *    aggregator a property-test surface in the first place.
 *  - CLAUDE.md rule 10 — test density should reflect risk; FSMs and
 *    formulas earn this much coverage, primitives do not.
 */
import fc from 'fast-check';

import type { BreakerConfig, SourceState, Thresholds, Tick } from '../types.js';
import type {
  AssetId,
  BreakerState,
  SourceHealth,
  SourceId,
} from '@price-oracle/contracts/primitives';

/**
 * Closed-set arbitraries for the four enum primitives. Mirrors the
 * Zod enums in `@price-oracle/contracts/primitives` — the literal
 * lists are duplicated on purpose so a test failure here is a clear
 * signal that the enum changed without updating the property suite.
 */
export const arbAssetId: fc.Arbitrary<AssetId> = fc.constantFrom('btc', 'eth');
export const arbSourceId: fc.Arbitrary<SourceId> = fc.constantFrom('binance', 'coinbase', 'mock');
export const arbSourceHealth: fc.Arbitrary<SourceHealth> = fc.constantFrom(
  'HEALTHY',
  'DEGRADED',
  'STALE',
);
export const arbBreakerState: fc.Arbitrary<BreakerState> = fc.constantFrom(
  'CLOSED',
  'HALF_OPEN',
  'OPEN',
);

/**
 * Millis timestamp / duration in `[0, 10^12]`. The upper bound is
 * roughly "year 33658" in epoch millis — wide enough to cover any
 * realistic now/then arithmetic, narrow enough that fast-check
 * shrinkers stay snappy.
 */
export const arbMillis: fc.Arbitrary<number> = fc.integer({ min: 0, max: 10 ** 12 });

/**
 * Price in `[0.01, 10^9]`, matching the `Price` primitive's
 * `z.number().positive()` constraint while staying well clear of
 * floating-point pathologies. `noNaN: true, noDefaultInfinity: true`
 * because the price contract rejects both and we want property tests
 * to live in the same domain as the boundary.
 */
export const arbPrice: fc.Arbitrary<number> = fc.double({
  min: 0.01,
  max: 10 ** 9,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * Confidence in `[0, 1]` — the closed interval enforced by the
 * `Confidence` primitive. Used by breaker property tests as the
 * raw input to `transitionBreaker`, and by aggregate-formula tests
 * as the expected output range.
 */
export const arbConfidence: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * A well-formed `Tick`. `sourceTimestamp` is `option(arbMillis, {
 * nil: undefined })` because the contract treats it as optional —
 * Coinbase delivers it, the mock and Binance sometimes don't.
 */
export const arbTick: fc.Arbitrary<Tick> = fc.record({
  asset: arbAssetId,
  source: arbSourceId,
  price: arbPrice,
  receivedAt: arbMillis,
  sourceTimestamp: fc.option(arbMillis, { nil: undefined }),
});

/**
 * A `SourceState` value. The two `option(..., { nil: null })`
 * wrappers reproduce the FSM's "I have never observed this" sentinel
 * — `lastTickAt === null` is the initial post-construction state and
 * also what `classifyHealth` reads as STALE.
 *
 * `pendingStreak: fc.nat({ max: 20 })` — much higher than any
 * realistic `healthHysteresisStreak`, so the property tests stress
 * the post-commit branch (`pendingStreak >= healthHysteresisStreak`)
 * across the full range.
 */
export const arbSourceState: fc.Arbitrary<SourceState> = fc.record({
  asset: arbAssetId,
  source: arbSourceId,
  health: arbSourceHealth,
  lastTickAt: fc.option(arbMillis, { nil: null }),
  lastPrice: fc.option(arbPrice, { nil: null }),
  pendingHealth: fc.option(arbSourceHealth, { nil: null }),
  pendingStreak: fc.nat({ max: 20 }),
});

/**
 * `Thresholds` arbitrary. Each window is small enough that a
 * property test can simulate multi-step FSM trajectories without
 * having to plumb tens of millions of millis through `now`.
 *
 * Note: these arbitraries do **not** enforce the `degradedAfterMs <=
 * staleAfterMs <= freshnessDecayMs` ordering that
 * `orchestrator.config.ts` checks at boot. Property tests that
 * exercise the FSM under operational orderings narrow this further
 * via `fc.pre(...)`.
 */
export const arbThresholds: fc.Arbitrary<Thresholds> = fc.record({
  freshnessDecayMs: fc.integer({ min: 1, max: 60_000 }),
  degradedAfterMs: fc.integer({ min: 1, max: 30_000 }),
  staleAfterMs: fc.integer({ min: 1, max: 60_000 }),
  healthHysteresisStreak: fc.integer({ min: 1, max: 10 }),
});

/**
 * `BreakerConfig` arbitrary. `confidenceFloor` is in `[0.1, 0.9]`
 * (not the full `[0, 1]`) so that the property tests exercise the
 * interesting region — a floor of 0 or 1 makes the breaker trivially
 * always-open or always-closed, which is not where the bugs live.
 */
export const arbBreakerConfig: fc.Arbitrary<BreakerConfig> = fc.record({
  confidenceFloor: fc.double({ min: 0.1, max: 0.9, noNaN: true, noDefaultInfinity: true }),
  tripStreak: fc.integer({ min: 2, max: 10 }),
  recoveryWindowMs: fc.integer({ min: 1, max: 60_000 }),
  halfOpenProbeStreak: fc.integer({ min: 2, max: 10 }),
});
