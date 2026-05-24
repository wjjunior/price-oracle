/**
 * @file The chaos admin HTTP surface — the *only* admin/chaos API in
 * the entire codebase.
 *
 * **Why this is mock-only.** CLAUDE.md operational quirks: "Mock
 * ingestor admin API is dev-only. The chaos endpoints exist only on
 * the mock. Real ingestors expose no admin surface; their failures
 * are observed, not injected." The `decisions.md` rationale on the
 * chaos surface puts it sharply: synthesizing a fake failure inside a
 * real ingestor would make the demo lie — we'd observe a fake
 * failure. The mock owns the chaos surface, and the same image is
 * safe to deploy outside dev because the entire controller (and the
 * `AdminModule` that registers it) is gated behind
 * `MOCK_ADMIN_ENABLED=true` (default `false` since PRO-54; flag
 * itself introduced in PRO-44 — see `config/env.schema.ts`).
 *
 * **Endpoints.** All five are mounted under `/admin/...`:
 *
 *  - `POST /admin/:asset/disconnect` — stop publishing for that asset.
 *    The aggregator's coverage drops; the source FSM ages this source
 *    HEALTHY → DEGRADED → STALE; the breaker may trip if confidence
 *    falls below the floor for long enough.
 *  - `POST /admin/:asset/stale` — start republishing the frozen
 *    `(price, sourceTimestamp)` pair. Freshness stays high but
 *    cross-source agreement degrades. The freeze captures the *last
 *    published* values when available, falling back to the asset's
 *    anchor price if no tick has been published yet (very early
 *    boot).
 *  - `POST /admin/:asset/malformed` — publish payloads that fail
 *    `TickSchema` (`price: null`) at the aggregator's boundary. The
 *    aggregator's NATS subscriber rejects them, logs a `warn`, and
 *    no tick reaches the source FSM (so this asset ages the same
 *    way as `disconnect`).
 *  - `POST /admin/:asset/reset` — return the asset to HEALTHY mode.
 *  - `POST /admin/reset-all` — reset both assets in one call.
 *  - `GET  /admin/status` — return the current chaos mode of every
 *    asset, with `since` timestamps so the dashboard can render
 *    "DISCONNECTED for 12s" counters.
 *
 * **Asset route param.** Validated by `AssetParamPipe`, which runs
 * the value through the `AssetId` Zod enum (so a typo'd `/admin/btv/...`
 * produces a 400 with the allowed values, not a 404 or a silently-
 * misbehaving call).
 *
 * **Status responses are 200, not 201.** `@HttpCode(HttpStatus.OK)`
 * overrides Nest's default 201-for-POST because these endpoints do
 * not *create* a resource in the REST sense — they flip a state
 * machine. 200 communicates "we processed your command" without the
 * "and created a new entity" baggage of 201.
 *
 * **The status response shape.** `AssetStateResponse` flattens the
 * discriminated `ChaosState` for the wire: `{ asset, mode, since,
 * frozenPrice? }`. The `frozenPrice` is only populated for the
 * `STALE` variant. The dashboard's chaos-controls widget
 * (`frontend/dashboard/src/widgets/chaos-controls/`) consumes this
 * shape directly.
 *
 * Cross-refs:
 *  - `admin.module.ts` for the gating logic.
 *  - `../mock/chaos-state.service.ts` for the state mutations called
 *    from each handler.
 *  - `../mock/chaos-mode.ts` for what each mode does to the
 *    aggregator.
 *  - `frontend/dashboard/src/widgets/chaos-controls/` for the UI.
 */
import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { type AssetId, type Millis } from '@price-oracle/contracts/primitives';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';
import { ChaosMode, type ChaosState } from '../mock/chaos-mode.js';
import { ChaosStateService } from '../mock/chaos-state.service.js';
import { TickGeneratorService } from '../mock/tick-generator.service.js';

import { AssetParamPipe } from './asset-param.pipe.js';

/**
 * Wire shape returned by every admin endpoint (and one element of
 * the `GET /admin/status` array). Flattens the discriminated
 * `ChaosState` so the dashboard does not have to walk a union to
 * render a row.
 *
 * `frozenPrice` is present only when `mode === 'stale'`. Other
 * variants omit it (rather than serializing `null`) so the JSON shape
 * is closed against the variants it really has.
 */
interface AssetStateResponse {
  readonly asset: AssetId;
  readonly mode: ChaosState['mode'];
  readonly since: Millis;
  readonly frozenPrice?: number;
}

/**
 * Pick the anchor price for the given asset from the parsed config.
 *
 * Used as the fallback price when the operator hits
 * `POST /admin/:asset/stale` before any tick has been published —
 * we want to freeze *something* meaningful, and the anchor is the
 * value the random walk would have stepped off of anyway.
 */
const anchorFor = (asset: AssetId, cfg: IngestorConfig): number =>
  asset === 'btc' ? cfg.btcAnchorUsd : cfg.ethAnchorUsd;

/**
 * Flatten a `ChaosState` into the wire response shape. The narrowing
 * on `state.mode === ChaosMode.STALE` is what gives TypeScript access
 * to `state.frozenPrice` — that field only exists on the STALE
 * variant of the discriminated union (see `chaos-mode.ts`).
 */
const describe = (asset: AssetId, state: ChaosState): AssetStateResponse => {
  if (state.mode === ChaosMode.STALE) {
    return { asset, mode: state.mode, since: state.since, frozenPrice: state.frozenPrice };
  }
  return { asset, mode: state.mode, since: state.since };
};

/**
 * NestJS controller for the chaos surface. Mounted at `/admin/...`.
 *
 * Constructor uses explicit `@Inject(...)` on every parameter —
 * CLAUDE.md operational quirks: under `tsx`, type-based DI silently
 * resolves to `undefined` because `design:paramtypes` metadata is not
 * emitted.
 */
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(ChaosStateService) private readonly chaos: ChaosStateService,
    @Inject(TickGeneratorService) private readonly generator: TickGeneratorService,
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
  ) {}

  /**
   * Flip the asset to DISCONNECTED. Tick generator will skip publishes
   * for this asset until `reset` is called.
   *
   * Response is the asset's new state — the dashboard uses it to
   * confirm the mutation took, and to start its "DISCONNECTED for X"
   * counter from the returned `since`.
   */
  @Post(':asset/disconnect')
  @HttpCode(HttpStatus.OK)
  disconnect(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.setDisconnected(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  /**
   * Flip the asset to STALE. Captures the last published
   * `(price, sourceTimestamp)` pair from the tick generator and
   * passes it to the chaos state so subsequent ticks repeat exactly
   * that pair.
   *
   * Fallback path: if no tick has ever been published (very early
   * boot, before the first interval has run), freeze the *anchor*
   * price plus `now` as the source timestamp. That keeps the
   * endpoint usable from second one and avoids a 409/precondition
   * dance, at the small cost of the first stale freeze potentially
   * being a tick "older than itself" if anchor != initial walk
   * value (it is the same value, in practice).
   */
  @Post(':asset/stale')
  @HttpCode(HttpStatus.OK)
  stale(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    const last = this.generator.lastPublished(asset);
    const now = Date.now();
    if (last) {
      this.chaos.setStale(asset, now, last.price, last.sourceTimestamp);
    } else {
      // Early-boot fallback: no tick has been published yet, so use
      // the asset's anchor price and the current wall-clock as the
      // frozen pair.
      this.chaos.setStale(asset, now, anchorFor(asset, this.config), now);
    }
    return describe(asset, this.chaos.get(asset));
  }

  /**
   * Flip the asset to MALFORMED. Tick generator will publish a
   * payload that fails `TickSchema` at the aggregator boundary
   * (`price: null`). The aggregator rejects it with a `warn` log.
   */
  @Post(':asset/malformed')
  @HttpCode(HttpStatus.OK)
  malformed(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.setMalformed(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  /**
   * Return the asset to HEALTHY. Random-walk ticks resume on the
   * next interval.
   */
  @Post(':asset/reset')
  @HttpCode(HttpStatus.OK)
  reset(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.reset(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  /**
   * Reset every asset to HEALTHY in one call. Convenience endpoint
   * the dashboard's "reset all" button hits; equivalent to calling
   * `/admin/:asset/reset` for each asset in turn.
   *
   * Returns the full status payload so the dashboard does not need
   * a follow-up `GET /admin/status` to refresh its UI.
   */
  @Post('reset-all')
  @HttpCode(HttpStatus.OK)
  resetAll(): { states: AssetStateResponse[] } {
    this.chaos.resetAll(Date.now());
    return this.status();
  }

  /**
   * Return the current chaos state of every asset. Ordering matches
   * `ChaosStateService.snapshot()` (currently `['btc', 'eth']`).
   *
   * The dashboard polls this on widget mount and after every chaos
   * mutation to render the chaos-controls table.
   */
  @Get('status')
  status(): { states: AssetStateResponse[] } {
    return { states: this.chaos.snapshot().map(({ asset, state }) => describe(asset, state)) };
  }
}
