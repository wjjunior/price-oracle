/**
 * @file The mock ingestor's heart — the per-asset interval loop that
 * reads `ChaosStateService` on every tick and dispatches to one of
 * four publish paths (normal, repeat-stale, malformed, skip).
 *
 * **Why this replaces the WebSocket loop of the real ingestors.** The
 * Binance and Coinbase ingestors maintain an outbound WebSocket and
 * publish a `Tick` for every inbound trade frame (see
 * `apps/ingestor-binance/src/binance/binance.service.ts` and the
 * sibling Coinbase file). The mock has no upstream exchange to listen
 * to, so instead it produces ticks on a `setInterval` cadence —
 * `MOCK_TICK_INTERVAL_MS` (default 250 ms, matching the rough cadence
 * of real BTC trades during active markets). The contract on the
 * wire is identical: same `Tick` schema, same `ticks.<asset>.mock`
 * subject, same correlation-ID header. The aggregator cannot tell
 * the difference between mock ticks and real ones; that is the
 * point.
 *
 * **Per-tick dispatch.** On each interval, for each asset, this
 * service:
 *
 *  1. Reads the asset's chaos mode from `ChaosStateService`.
 *  2. Generates a per-tick `correlationId` (one UUID per attempted
 *     tick, even if the tick is skipped or malformed — the
 *     `correlationId` is the operator's grep key end-to-end, so we
 *     want one even for the failure paths).
 *  3. Branches:
 *       - `DISCONNECTED`: return without publishing. Aggregator
 *         coverage drops; source FSM ages toward STALE.
 *       - `MALFORMED`: publish a payload that is valid JSON but fails
 *         `TickSchema` (`price: null`) via `publishRaw` — the schema-
 *         enforcing `publishContract` would reject it on our side
 *         before it ever hit the wire. The aggregator rejects it at
 *         its subscriber boundary (CLAUDE.md rule 5) and logs a `warn`.
 *       - `STALE`: publish a fresh `receivedAt` but keep the frozen
 *         price and frozen `sourceTimestamp` from when the operator
 *         flipped the asset. Freshness stays high (we are still
 *         sending), but agreement degrades as the real sources move
 *         and this one does not. See `chaos-mode.ts` for why this is
 *         the subtler chaos mode.
 *       - `HEALTHY`: advance the random walk by one step, publish a
 *         well-formed `Tick`, and remember `(lastPrice, lastTickAt)`
 *         so a future `setStale` call can freeze them.
 *
 * **Why we keep `lastPrice` / `lastTickAt` here, not in chaos state.**
 * The chaos state knows *what* fiction to serve; it does not know
 * what the real walk's last price was. We need that information when
 * the operator hits `POST /admin/:asset/stale` so we can freeze
 * the most recent real value rather than freeze a stale anchor. The
 * admin controller calls `lastPublished(asset)` for exactly that.
 *
 * **The `mock` source.** From the aggregator's point of view, `mock`
 * is a real source — see `SourceId = z.enum(['binance', 'coinbase',
 * 'mock'])` in `@price-oracle/contracts/primitives`. The only thing
 * that makes it "the mock" is this file and the admin chaos endpoints.
 *
 * Cross-refs:
 *  - `chaos-mode.ts` and `chaos-state.service.ts` for the state side.
 *  - `random-walk.ts` for `nextPrice` (the synthetic-price generator).
 *  - `apps/aggregator/src/domain/source-state.ts` for the FSM that
 *    consumes our ticks and decides HEALTHY/DEGRADED/STALE.
 *  - `frontend/dashboard/src/widgets/chaos-controls/` for the UI that
 *    drives this via the admin endpoints.
 */
import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { type AssetId, type Millis, type Price } from '@price-oracle/contracts/primitives';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

import { ChaosMode } from './chaos-mode.js';
import { ChaosStateService } from './chaos-state.service.js';
import { nextPrice } from './random-walk.js';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

// Canonical order of assets the generator emits per interval. Mirrors
// `ChaosStateService.ASSETS`; the lock-step is enforced by the
// `Record<AssetId, ...>` types on `lastPrice` / `lastTickAt` rather
// than by a runtime assertion.
const ASSETS: readonly AssetId[] = ['btc', 'eth'];

// Source-dimension constant on every published `Tick`. Typed as
// `SourceId` via the literal-as-const cast so a typo would fail the
// compile against the closed `SourceId` enum in
// `@price-oracle/contracts/primitives` (CLAUDE.md rule 3).
const MOCK_SOURCE = 'mock' as const;

/**
 * The (price, sourceTimestamp) pair the admin endpoint freezes when
 * flipping an asset to STALE.
 *
 * Returned by {@link TickGeneratorService.lastPublished}. The `null`
 * return on the same method means "no tick has ever been published
 * for this asset yet" — the admin endpoint falls back to the anchor
 * price in that case (see `admin/admin.controller.ts#stale`).
 */
export interface LastPublished {
  readonly price: Price;
  readonly sourceTimestamp: Millis;
}

/**
 * NestJS provider that runs the per-asset tick loop.
 *
 * Lifecycle is module-scoped via `OnModuleInit` / `OnModuleDestroy`:
 * the `setInterval` starts when the module boots and is cleared on
 * shutdown so the process can exit cleanly. The interval handle is
 * the only side-effecting state on the class — `lastPrice` and
 * `lastTickAt` are inert until `emitOne` updates them.
 */
@Injectable()
export class TickGeneratorService implements OnModuleInit, OnModuleDestroy {
  // Active `setInterval` handle. `null` between `onModuleDestroy` and
  // the next (never-coming) `onModuleInit` — Nest does not re-init
  // a module after destroy, so this is really a one-shot lifecycle.
  private interval: NodeJS.Timeout | null = null;

  // Last *successfully published* price per asset. Seeded in the
  // constructor with the asset's anchor (so the very first tick is a
  // step away from the anchor, not from `undefined`), advanced by the
  // random walk on every healthy publish.
  private readonly lastPrice: Record<AssetId, Price>;

  // Last publish time per asset, used to feed `LastPublished` to the
  // admin endpoint. Initialized to 0 as the "never published" sentinel
  // — `lastPublished(asset)` returns `null` while this is 0.
  private readonly lastTickAt: Record<AssetId, Millis> = { btc: 0, eth: 0 };

  /**
   * Constructor — explicit `@Inject(...)` on every parameter because
   * `tsx` (the dev runner) does not emit TypeScript's
   * `design:paramtypes` decorator metadata, so type-based DI would
   * resolve to `undefined` at runtime. CLAUDE.md operational quirks:
   * "NestJS DI under `tsx` needs explicit `@Inject()` on every
   * constructor parameter."
   */
  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(ChaosStateService) private readonly chaos: ChaosStateService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    // Bind `context: 'TickGeneratorService'` to every pino log line
    // from this class so the dashboard / `pino-pretty` filter groups
    // them under the right service name without us repeating it.
    this.logger.setContext(TickGeneratorService.name);

    // Seed the walk with the per-asset anchor from config. The first
    // `emitOne(HEALTHY)` then steps once off the anchor and publishes.
    this.lastPrice = {
      btc: config.btcAnchorUsd,
      eth: config.ethAnchorUsd,
    };
  }

  /**
   * Lifecycle: start the tick loop. Emits one tick immediately so the
   * dashboard sees data on boot (rather than waiting `tickIntervalMs`
   * for the first interval to fire), then runs on the configured
   * cadence.
   */
  onModuleInit(): void {
    this.emitAll();
    this.interval = setInterval(() => this.emitAll(), this.config.tickIntervalMs);
    this.logger.info(
      { event: 'lifecycle.start', intervalMs: this.config.tickIntervalMs },
      'Tick generator started',
    );
  }

  /**
   * Lifecycle: stop the tick loop. Idempotent guard on the handle so
   * a double-destroy (which Nest does not do, but defensive) is safe.
   */
  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.logger.info({ event: 'lifecycle.stop' }, 'Tick generator stopped');
  }

  /**
   * Expose the last published `(price, sourceTimestamp)` pair for an
   * asset, so the admin endpoint's `POST /admin/:asset/stale` can
   * freeze the *most recent real* value rather than the anchor.
   *
   * Returns `null` when no tick has been published yet — the admin
   * endpoint treats that as "fall back to the anchor price plus now".
   * The check is "have we ever set `lastTickAt`?", not "is the
   * current `lastPrice` non-default", because `lastPrice` starts at
   * the anchor and a freshly-stepped walk that landed exactly on the
   * anchor would be indistinguishable from "never published".
   */
  lastPublished(asset: AssetId): LastPublished | null {
    if (this.lastTickAt[asset] === 0) return null;
    return { price: this.lastPrice[asset], sourceTimestamp: this.lastTickAt[asset] };
  }

  /**
   * Per-interval driver: read a single `now` (so both assets share
   * the same wall-clock) and emit each asset.
   */
  private emitAll(): void {
    const now = Date.now();
    for (const asset of ASSETS) this.emitOne(asset, now);
  }

  /**
   * Emit (or skip, or sabotage) one tick for one asset.
   *
   * Dispatch order is deliberate: the disconnect check comes first
   * because it is the only path that does *nothing*, and we want to
   * bail before generating a UUID. Malformed comes before stale so
   * the operator can stack chaos modes if they want — though today
   * the state machine is single-mode-per-asset, so this is more
   * about code clarity than functional ordering.
   */
  private emitOne(asset: AssetId, now: Millis): void {
    const state = this.chaos.get(asset);
    const correlationId = randomUUID();
    const subject = ticksSubject(asset, MOCK_SOURCE);

    // DISCONNECTED: do nothing. The aggregator sees no tick, source
    // freshness decays, the source FSM eventually transitions to
    // STALE, and the aggregate's coverage factor drops. See
    // `apps/aggregator/src/domain/source-state.ts`.
    if (state.mode === ChaosMode.DISCONNECTED) return;

    // MALFORMED: publish via `publishRaw` (bypassing `publishContract`,
    // which would reject the `price: null` against `TickSchema` on our
    // side). The aggregator will reject this at its NATS subscriber's
    // Zod parse — that is the demo: schema validation catches a bad
    // upstream payload before it can poison the median. Audit and
    // `warn` log are emitted by the aggregator, not by us.
    if (state.mode === ChaosMode.MALFORMED) {
      const body = JSON.stringify({ asset, source: MOCK_SOURCE, price: null, receivedAt: now });
      this.nats.publishRaw(subject, body, correlationId);
      return;
    }

    // STALE: republish the frozen pair on every interval. Note that
    // `receivedAt` is `now` (we *are* still sending), but `price` and
    // `sourceTimestamp` are the snapshot from when the operator hit
    // the admin endpoint. The aggregator's source FSM keys off
    // `receivedAt` for freshness — so the source stays HEALTHY by
    // that metric — but cross-source agreement degrades because the
    // mock's reported price no longer tracks the real ones.
    if (state.mode === ChaosMode.STALE) {
      this.nats.publishContract(
        TickSchema,
        subject,
        {
          asset,
          source: MOCK_SOURCE,
          price: state.frozenPrice,
          receivedAt: now,
          sourceTimestamp: state.frozenSourceTimestamp,
        },
        correlationId,
      );
      return;
    }

    // HEALTHY: advance the random walk by one step and publish a
    // well-formed tick. `Math.random` is the RNG in production; tests
    // exercise `nextPrice` directly with a deterministic function.
    const price = nextPrice(this.lastPrice[asset], {
      volatilityPct: this.config.priceVolatilityPct,
      rand: Math.random,
    });
    // Remember the new high-water marks so `lastPublished()` can
    // return them when the admin endpoint freezes this asset.
    this.lastPrice[asset] = price;
    this.lastTickAt[asset] = now;
    this.nats.publishContract(
      TickSchema,
      subject,
      // `sourceTimestamp === receivedAt` here because the mock has no
      // upstream exchange clock; in the real ingestors these differ
      // (exchange-side fill time vs. our receive time). The aggregator
      // uses `receivedAt` for freshness, so the equality is harmless.
      { asset, source: MOCK_SOURCE, price, receivedAt: now, sourceTimestamp: now },
      correlationId,
    );
  }
}
