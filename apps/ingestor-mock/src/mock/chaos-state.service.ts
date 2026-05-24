/**
 * @file In-memory per-asset chaos state — the *only* mutable runtime
 * state the mock ingestor owns.
 *
 * Everything else in this app is read-only or derived: the tick
 * generator reads the chaos state, the admin controller writes to it,
 * the random walk only mutates its own price counters (which are
 * really just smoothed RNG output, not "state" in a meaningful sense).
 * This service is the single source of truth for "is BTC currently
 * pretending to be disconnected?" and "is ETH currently pretending to
 * be stale?".
 *
 * **Why per-asset, not global.** CLAUDE.md operational quirks open
 * with "Asset is a first-class dimension throughout the system."
 * BTC and ETH must remain independently degradable: a reviewer must
 * be able to disconnect BTC and watch the aggregator route around it
 * while ETH continues to publish normally. A single global "chaos
 * mode" enum would collapse the dimension and make the demo less
 * informative.
 *
 * **Why a fixed `Record<AssetId, ChaosState>`.** The asset set is
 * closed (BTC, ETH) at the `AssetId` Zod enum in
 * `@price-oracle/contracts/primitives`. A `Record<AssetId, ...>` plus
 * the inline initializer below makes "every asset has a defined state
 * at all times" a property of the type, not a runtime invariant we
 * have to defend with `?? ChaosMode.HEALTHY` everywhere a caller
 * reads. Adding a new asset is a deliberate, codebase-wide change
 * (CLAUDE.md operational quirks again) — TypeScript will force this
 * file to grow a new initial-state entry, exactly the kind of
 * compile-time prompt we want.
 *
 * **No-op-on-equal-mode pattern.** Each setter starts with
 * `if (this.states[asset].mode === ChaosMode.X) return;`. The point
 * is idempotency: hitting `POST /admin/btc/disconnect` twice in a
 * row should not bump the `since` timestamp on the second call,
 * because the operator's mental model is "disconnect started at T1"
 * and resetting `since` to T2 would lie about that. Tests rely on
 * this; the dashboard's "disconnected for X seconds" counter would
 * jitter without it.
 *
 * Cross-refs:
 *  - `chaos-mode.ts` — the discriminated union of states.
 *  - `tick-generator.service.ts` — the consumer that reads `get(asset)`
 *    on every interval and dispatches to the right publish path.
 *  - `admin/admin.controller.ts` — the HTTP surface that calls the
 *    `setXxx` / `reset` mutators.
 */
import { Injectable } from '@nestjs/common';

import { ChaosMode, type ChaosState } from './chaos-mode.js';

import type { AssetId, Millis, Price } from '@price-oracle/contracts/primitives';

// Canonical asset order used for `snapshot()` and `resetAll()`. Pulled
// to a module constant so the iteration order is deterministic and
// tests can rely on it. If `AssetId` ever grows to include more than
// BTC and ETH, this array must be extended in lock-step — but the
// `Record<AssetId, ChaosState>` initializer on the class will force
// that as a compile error, so we will not silently miss it.
const ASSETS: readonly AssetId[] = ['btc', 'eth'];

// "Never been touched" sentinel for the initial `since` on boot.
// Using 0 (epoch) rather than `Date.now()` keeps the boot path pure
// (no clock read at module evaluation) and makes the initial state
// trivially recognizable in tests: any non-zero `since` means the
// operator has interacted with this asset at least once.
const INITIAL_TIME: Millis = 0;

/**
 * NestJS provider that owns the chaos state map for both assets.
 *
 * All methods are synchronous and pure-ish (they mutate `this.states`
 * but do not touch the clock, the network, or any other shared
 * resource — callers pass `now` in so the mutator stays testable).
 * The service is registered in `MockModule` and injected by both the
 * tick generator and the admin controller.
 */
@Injectable()
export class ChaosStateService {
  // Initial state: both assets HEALTHY with `since: 0`. The
  // `Record<AssetId, ChaosState>` annotation is what enforces "every
  // asset must have an entry" at compile time — see the file header.
  private readonly states: Record<AssetId, ChaosState> = {
    btc: { mode: ChaosMode.HEALTHY, since: INITIAL_TIME },
    eth: { mode: ChaosMode.HEALTHY, since: INITIAL_TIME },
  };

  /**
   * Read the current chaos state for one asset.
   *
   * Returns the live object reference — callers must treat it as
   * read-only (the `ChaosState` type is recursively `readonly`, so
   * accidental mutation fails at compile time).
   */
  get(asset: AssetId): ChaosState {
    return this.states[asset];
  }

  /**
   * Flip the asset into DISCONNECTED mode (tick generator will skip
   * all publishes for this asset until `reset` is called).
   *
   * Idempotent: a second call while already DISCONNECTED is a no-op
   * and does not bump `since`. That preserves the "disconnected since
   * T1" semantics the dashboard surfaces.
   */
  setDisconnected(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.DISCONNECTED) return;
    this.states[asset] = { mode: ChaosMode.DISCONNECTED, since: now };
  }

  /**
   * Flip the asset into STALE mode by capturing a `(price, sourceTimestamp)`
   * pair to be repeated on every subsequent tick.
   *
   * The admin controller is responsible for choosing what to freeze
   * — it tries the *last published* tick first, and falls back to the
   * asset's anchor price plus `now` if the generator has never
   * published yet (very early boot). See
   * `admin/admin.controller.ts#stale`.
   *
   * Idempotent in the same sense as `setDisconnected`: if already
   * STALE, we keep the *original* frozen pair rather than re-capturing
   * a fresh one. That matters because re-capturing would slowly drift
   * the frozen price toward the live price, which would be a subtle
   * lie about what "stale since T1" means.
   */
  setStale(asset: AssetId, now: Millis, frozenPrice: Price, frozenSourceTimestamp: Millis): void {
    if (this.states[asset].mode === ChaosMode.STALE) return;
    this.states[asset] = {
      mode: ChaosMode.STALE,
      since: now,
      frozenPrice,
      frozenSourceTimestamp,
    };
  }

  /**
   * Flip the asset into MALFORMED mode (tick generator will publish
   * payloads that fail `TickSchema` at the aggregator boundary).
   *
   * Idempotent on `since` per the pattern.
   */
  setMalformed(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.MALFORMED) return;
    this.states[asset] = { mode: ChaosMode.MALFORMED, since: now };
  }

  /**
   * Return the asset to HEALTHY mode (random-walk ticks resume on the
   * next interval).
   *
   * Idempotent: resetting an already-HEALTHY asset is a no-op and
   * does not bump `since`, so the dashboard's "healthy since T1"
   * timestamp stays stable across an idle reset click.
   */
  reset(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.HEALTHY) return;
    this.states[asset] = { mode: ChaosMode.HEALTHY, since: now };
  }

  /**
   * Reset every asset to HEALTHY in one call (bound to
   * `POST /admin/reset-all`). Calls `reset` for each asset so the
   * per-asset idempotency guarantee applies element-wise: assets
   * that were already HEALTHY keep their original `since`.
   */
  resetAll(now: Millis): void {
    for (const asset of ASSETS) this.reset(asset, now);
  }

  /**
   * Materialize the entire state map as an ordered array, used by
   * `GET /admin/status` to render the dashboard table.
   *
   * Order matches `ASSETS` (currently `['btc', 'eth']`). Tests rely
   * on that ordering — do not switch to `Object.entries(this.states)`,
   * which is technically insertion-ordered today but not contractually
   * so.
   */
  snapshot(): Array<{ asset: AssetId; state: ChaosState }> {
    return ASSETS.map((asset) => ({ asset, state: this.states[asset] }));
  }
}
