/**
 * @file The aggregator's per-pulse orchestrator — the application
 * layer of the hexagonal hybrid.
 *
 * **What this file is.** The single composition root of the
 * aggregator's domain logic. The orchestrator holds the per-asset
 * runtime state, drives the 500ms aggregation pulse, fans out SSE
 * envelopes, and writes through to the audit / publish ports. It
 * depends only on `domain/` (FSMs, formulas, ports); the
 * `infrastructure/` adapters are wired in by `interface/app.module.ts`
 * and arrive here as `OrchestratorDeps`.
 *
 * **Layer responsibilities (CLAUDE.md hexagonal hybrid).**
 *  - `domain/`         — pure FSMs and formulas. No I/O, no
 *                        `Date.now()`. The orchestrator *uses* these.
 *  - `application/`    — *this file*. Orchestrates domain pieces,
 *                        owns runtime state, talks to ports. Promises
 *                        live here; the domain stays synchronous.
 *  - `infrastructure/` — adapters that satisfy the ports.
 *  - `interface/`      — NestJS DI and HTTP/SSE controllers.
 *
 * **Two pulse drivers.**
 *  1. **Tick-driven** — `routeTick(tick, correlationId)` is the NATS
 *     callback from `SourceStreamPort.subscribe`. Each tick updates
 *     the source FSM immediately, so per-source health changes
 *     surface as soon as the tick arrives, not on the next 500ms
 *     boundary.
 *  2. **Time-driven** — `runScheduledPulse()` fires every
 *     `aggregationIntervalMs` (default 500). It ages every source
 *     forward, runs aggregation, advances the breaker, may publish,
 *     may detect anomalies.
 *
 * The `pulseInFlight` guard prevents overlapping pulses if a single
 * pulse's audit/publish I/O takes longer than the interval — under
 * load we drop a pulse with a `warn`, never queue them. This matches
 * the "lossy by design" stance: the next pulse will publish fresh
 * data anyway, and queuing would let work pile up indefinitely.
 *
 * **Per-asset isolation (CLAUDE.md operational quirks).** The
 * `runtime: Map<AssetId, AssetRuntime>` keeps BTC and ETH state
 * fully independent — degrading BTC sources cannot affect ETH
 * aggregation. `per-asset-isolation.property.test.ts` proves this
 * with fast-check.
 *
 * **Correlation IDs.** Each tick carries its ingestor-generated ID
 * end-to-end. Each *pulse* generates a fresh ID (`randomUUID()`) for
 * the audit/publish/SSE events emitted by aging and aggregation.
 *
 * **Snapshot drain queue (per-asset).** `recordAggregate` writes to
 * Mongo (off the publish hot path — CLAUDE.md operational quirks).
 * If Mongo is slow, multiple pulses can land before the previous
 * write resolves. `scheduleSnapshot` / `drainSnapshots` coalesces
 * pending snapshots: at most one in-flight per asset, and the
 * pending value is always the latest. This trades older snapshots
 * for the latest at the cost of never publishing duplicates — exactly
 * the right trade-off for a "current aggregate" surface.
 *
 * **EventEmitter for SSE fan-out.** `setMaxListeners(0)` because the
 * SSE controller registers one listener per connected dashboard tab
 * and the default cap of 10 would page on a small demo. The emitter
 * is internal; the controller registers via `onEvent` and gets back
 * an unsubscribe function.
 *
 * Cross-references:
 *  - `decisions.md` Entry 3: hexagonal hybrid.
 *  - `decisions.md` Entry 2: NATS Core, ephemeral ticks.
 *  - CLAUDE.md operational quirks: aggregator restart, correlation
 *    propagation, asset-as-first-class-dimension, Mongo off the hot
 *    path, anomaly edge-trigger.
 */
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';

import {
  buildAnomalyDetectedEvent,
  buildBreakerStateChangedEvent,
  buildSourceStateChangedEvent,
} from '@price-oracle/contracts/events';

import { aggregate } from '../domain/aggregate.js';
import { detectAnomaly } from '../domain/anomaly-detector.js';
import { transitionBreaker } from '../domain/breaker.js';
import { updateSourceState } from '../domain/source-state.js';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { PublishPort } from '../domain/ports/publish.port.js';
import type { SourceStreamPort, Unsubscribe } from '../domain/ports/source-stream.port.js';
import type {
  AggregatePrice,
  AnomalyConfig,
  BreakerConfig,
  BreakerState,
  SourceState,
  Thresholds,
  Tick,
} from '../domain/types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, CorrelationId, Millis, SourceId } from '@price-oracle/contracts/primitives';
import type { SseEnvelope } from '@price-oracle/contracts/sse';
import type { Logger } from 'pino';

/**
 * Local literal table for breaker states. CLAUDE.md rule 3 — every
 * comparison goes through this symbol, never a bare `'OPEN'` string.
 * `satisfies` keeps the table in lock-step with the `BreakerState`
 * union.
 */
const BREAKER = {
  CLOSED: 'CLOSED',
  HALF_OPEN: 'HALF_OPEN',
  OPEN: 'OPEN',
} as const satisfies Record<BreakerState, BreakerState>;

const SSE_EVENT = 'sse';
const DRIFT_METRIC = 'price-drift';
/**
 * Sources start in STALE, not HEALTHY: we have not yet observed a
 * single tick from them at construction time, and `classifyHealth`
 * with `lastTickAt === null` returns STALE for the same reason.
 * Starting in HEALTHY would mean a freshly-booted aggregator
 * publishes an aggregate based on imaginary contributors before any
 * tick lands.
 */
const INITIAL_HEALTH = 'STALE';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : inspect(error);

/**
 * Static configuration: the closed set of assets/sources the
 * aggregator listens for, the pulse cadence, and the three FSM/
 * formula configs. Built at composition time from env vars by
 * `interface/orchestrator.config.ts`.
 */
export type OrchestratorConfig = {
  readonly assets: readonly AssetId[];
  readonly sources: readonly SourceId[];
  readonly aggregationIntervalMs: Millis;
  readonly thresholds: Thresholds;
  readonly breaker: BreakerConfig;
  readonly anomaly: AnomalyConfig;
};

/**
 * Runtime collaborators. `now` is parameterized (default `Date.now`)
 * so tests can drive a fake clock through the orchestrator without
 * stubbing — this is the application-layer equivalent of CLAUDE.md
 * rule 16's "time enters as a parameter" for the domain.
 */
export type OrchestratorDeps = {
  readonly sourceStream: SourceStreamPort;
  readonly publisher: PublishPort;
  readonly audit: AuditPort;
  readonly logger: Logger;
  readonly now?: () => Millis;
};

/**
 * Per-asset breaker bookkeeping. The streak counter is updated by
 * `advanceBreaker` on each pulse; the pure `transitionBreaker`
 * function reads it and returns the next state. `openedAt` is set
 * the moment we transition to OPEN so the recovery-window timer can
 * start.
 */
type BreakerRuntime = { state: BreakerState; streak: number; openedAt: Millis | null };

/**
 * All per-asset runtime state. The orchestrator constructs one of
 * these per asset at boot and never replaces the outer object —
 * fields are mutated in place because this is the application layer
 * (CLAUDE.md rule 16 applies to `domain/` only).
 *
 *  - `sources`:          per-source FSM state (immutable values, the
 *                        Map entry is swapped on each update).
 *  - `breaker`:          mutable breaker bookkeeping (see above).
 *  - `anomalyStreaks`:   per-source drift streaks; gated by
 *                        `anomaly.streakLength` for edge-triggered
 *                        emission.
 *  - `lastAggregate`:    last published aggregate; served by
 *                        `/api/snapshot`. Recovered from Mongo on
 *                        startup.
 *  - `snapshotPending`/`snapshotDraining`: coalescing queue for
 *                        async `recordAggregate` writes (one in-flight
 *                        per asset, always the latest).
 */
type AssetRuntime = {
  readonly sources: Map<SourceId, SourceState>;
  breaker: BreakerRuntime;
  readonly anomalyStreaks: Map<SourceId, number>;
  lastAggregate: AggregatePrice | null;
  snapshotPending: AggregatePrice | null;
  snapshotDraining: boolean;
};

export class Orchestrator {
  private readonly now: () => Millis;
  private readonly runtime: Map<AssetId, AssetRuntime>;
  private readonly emitter = new EventEmitter();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private pulseInFlight = false;

  /**
   * Pre-allocate every per-(asset, source) `SourceState` to its
   * initial "STALE, never ticked" value. This means the orchestrator
   * is fully observable from the moment it constructs — `/api/snapshot`
   * for an asset that has never received a tick returns the same
   * shape as one with a live tick history, just with `lastTickAt =
   * null`. CLAUDE.md operational quirks: "Asset is a first-class
   * dimension."
   */
  constructor(
    private readonly config: OrchestratorConfig,
    private readonly deps: OrchestratorDeps,
  ) {
    this.now = deps.now ?? ((): Millis => Date.now());
    // No upper bound on listeners — every SSE-connected dashboard tab
    // registers one. Default cap is 10, which trips on a small demo.
    this.emitter.setMaxListeners(0);
    this.runtime = new Map();
    for (const asset of config.assets) {
      const sources = new Map<SourceId, SourceState>();
      const anomalyStreaks = new Map<SourceId, number>();
      for (const source of config.sources) {
        sources.set(source, {
          asset,
          source,
          health: INITIAL_HEALTH,
          lastTickAt: null,
          lastPrice: null,
          pendingHealth: null,
          pendingStreak: 0,
        });
        anomalyStreaks.set(source, 0);
      }
      this.runtime.set(asset, {
        sources,
        breaker: { state: BREAKER.CLOSED, streak: 0, openedAt: null },
        anomalyStreaks,
        lastAggregate: null,
        snapshotPending: null,
        snapshotDraining: false,
      });
    }
  }

  /**
   * Boot the orchestrator. Three steps, in order:
   *
   *  1. **Restart recovery** — pull each asset's last persisted
   *     aggregate from `AuditPort.lastKnownAggregate(asset)` and seed
   *     `runtime.lastAggregate`. The snapshot controller serves this
   *     value immediately after restart, before any fresh tick has
   *     arrived (CLAUDE.md operational quirks: "Aggregator restart
   *     recovers `lastKnownAggregate` per asset from `AuditPort`").
   *  2. **Subscribe** to the tick firehose. The callback fires from
   *     the NATS adapter's thread of execution; we route synchronously
   *     into the per-asset runtime.
   *  3. **Schedule the pulse**. `setInterval` is fine here — the
   *     `pulseInFlight` guard handles overlap, and we never need
   *     drift correction (the next pulse will catch up regardless of
   *     when this one fires).
   */
  async start(): Promise<void> {
    for (const asset of this.config.assets) {
      const runtime = this.runtime.get(asset);
      if (!runtime) continue;
      runtime.lastAggregate = await this.deps.audit.lastKnownAggregate(asset);
    }
    this.unsubscribe = this.deps.sourceStream.subscribe((tick, correlationId) => {
      this.routeTick(tick, correlationId);
    });
    this.timer = setInterval(() => {
      // `void` because `setInterval` does not await the callback —
      // we want fire-and-forget per pulse, with the in-flight guard
      // doing the coalescing.
      void this.runScheduledPulse();
    }, this.config.aggregationIntervalMs);
    this.deps.logger.info({ event: 'orchestrator.start' }, 'Orchestrator started');
  }

  /**
   * Wrapper around `pulse(now)` that enforces non-overlap. If a
   * previous pulse is still settling its async I/O (Mongo write,
   * NATS publish), the new tick is dropped with a `warn` — never
   * queued. Queuing would let work pile up indefinitely under a
   * Mongo stall; dropping matches the "ticks are ephemeral" stance.
   */
  private async runScheduledPulse(): Promise<void> {
    if (this.pulseInFlight) {
      this.deps.logger.warn({ event: 'orchestrator.pulse-overlap' }, 'Skipping overlapping pulse');
      return;
    }
    this.pulseInFlight = true;
    try {
      await this.pulse(this.now());
    } finally {
      this.pulseInFlight = false;
    }
  }

  /**
   * Tear down the timer and the NATS subscription. Idempotent (safe
   * to call twice) because `lifecycle.service.ts` invokes it on
   * `onApplicationShutdown` and the test harnesses also call it
   * directly.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.deps.logger.info({ event: 'orchestrator.stop' }, 'Orchestrator stopped');
  }

  /**
   * Route one incoming tick into the matching per-asset / per-source
   * runtime. Called from the NATS subscriber callback.
   *
   * A tick for an asset/source not in `config.assets`/`config.sources`
   * is dropped with a `warn` and the original `correlationId`. This
   * is defensive: the NATS subscription pattern (`ticks.>`) accepts
   * everything, but the orchestrator is only configured for a closed
   * set. The ingestor-side enum (`SourceId` in primitives) is the
   * authoritative list.
   */
  routeTick(tick: Tick, correlationId: CorrelationId): void {
    const runtime = this.runtime.get(tick.asset);
    if (!runtime?.sources.has(tick.source)) {
      this.deps.logger.warn(
        { event: 'orchestrator.unknown-tick', asset: tick.asset, sourceId: tick.source, correlationId },
        'Dropping tick for unknown asset or source',
      );
      return;
    }
    this.applySourceUpdate(tick.asset, tick.source, tick, this.now(), correlationId);
  }

  /**
   * One pulse: iterate every configured asset and process it
   * independently. Per-asset isolation is a structural property of
   * this loop — each call to `pulseAsset` reads/writes only its own
   * `AssetRuntime`.
   */
  async pulse(now: Millis): Promise<void> {
    for (const asset of this.config.assets) {
      const runtime = this.runtime.get(asset);
      if (!runtime) continue;
      await this.pulseAsset(asset, runtime, now);
    }
  }

  /**
   * Read-only snapshot accessor — served by `/api/snapshot?asset=...`.
   * Returns the *last published* aggregate for the asset, recovered
   * from Mongo at startup and then updated on every CLOSED pulse.
   */
  getSnapshot(asset: AssetId): AggregatePrice | null {
    return this.runtime.get(asset)?.lastAggregate ?? null;
  }

  /**
   * Read-only per-source state list — served by `/api/snapshot` and
   * also folded into `DiagnoseContext` by the diagnose controller.
   * Returns a fresh array, not the internal Map's iterator, so the
   * caller cannot mutate orchestrator state by accident.
   */
  getSourceStates(asset: AssetId): readonly SourceState[] {
    const runtime = this.runtime.get(asset);
    return runtime ? [...runtime.sources.values()] : [];
  }

  /**
   * Read-only breaker state accessor. Unknown asset defaults to
   * CLOSED — defensive, should be unreachable because the snapshot
   * controller validates the asset via `AssetParamPipe` first.
   */
  getBreakerState(asset: AssetId): BreakerState {
    return this.runtime.get(asset)?.breaker.state ?? BREAKER.CLOSED;
  }

  /**
   * Subscribe to SSE envelopes. The stream controller wires this to
   * an Observable that feeds `@nestjs/common` `@Sse()`. Returns an
   * unsubscribe function the controller calls on connection close.
   */
  onEvent(listener: (envelope: SseEnvelope) => void): () => void {
    this.emitter.on(SSE_EVENT, listener);
    return (): void => {
      this.emitter.off(SSE_EVENT, listener);
    };
  }

  /**
   * The per-asset pulse step. Ordering matters — change it carefully:
   *
   *  1. **Fresh correlation ID** for this pulse. Pulse-driven audit
   *     events (breaker transitions, anomaly detections) carry this
   *     ID end-to-end through NATS, audit DB, and SSE envelope.
   *
   *  2. **Age every source** by calling `applySourceUpdate` with
   *     `tick = null`. This is what turns "no tick arrived recently"
   *     into a DEGRADED/STALE classification — `updateSourceState`
   *     reclassifies on every call, even when no new tick is
   *     available. Health transitions discovered here emit
   *     `SourceStateChanged` audit events.
   *
   *  3. **Stream the current freshness picture** to SSE listeners
   *     via `emitSourceFreshness`. This is what the dashboard reads
   *     to render the "X seconds ago" labels on the source-health
   *     widget. Streamed every pulse so the labels animate even when
   *     no health state changed.
   *
   *  4. **Aggregate** via the pure `aggregate(...)` domain function.
   *     A `null` result means "no source is active" — the breaker
   *     still advances (on confidence=0), but we publish nothing.
   *
   *  5. **Advance the breaker** with the just-computed confidence.
   *     Breaker transitions emit `BreakerStateChanged` audit events
   *     and a `breaker-state` SSE envelope. Note that the breaker
   *     runs even when the aggregate is null — that is what trips
   *     when *all* sources go silent.
   *
   *  6. **Publish + record the aggregate** only if (a) we produced
   *     one and (b) the breaker is not OPEN. CLAUDE.md operational
   *     quirks: when OPEN, the dashboard treats the aggregate as
   *     "do not act on this", so we also stop publishing it on NATS
   *     — downstream consumers see the absence as the signal.
   *
   *  7. **Detect anomalies** for every source (only when an aggregate
   *     was produced, since the comparison needs a reference price).
   *     Edge-triggered: only the transition into the anomalous
   *     state emits an `AnomalyDetected` event.
   */
  private async pulseAsset(asset: AssetId, runtime: AssetRuntime, now: Millis): Promise<void> {
    const correlationId: CorrelationId = randomUUID();

    // Step 2: age every source (tick=null = "no fresh observation").
    for (const source of this.config.sources) {
      this.applySourceUpdate(asset, source, null, now, correlationId);
    }

    // Step 3: stream the current per-source picture to SSE so the
    // dashboard can re-render "X seconds since last tick" labels.
    this.emitSourceFreshness(asset, runtime, correlationId);

    const states = [...runtime.sources.values()];
    // Step 4: aggregate.
    const result = aggregate(states, now, this.config.thresholds);
    // Confidence stays at 0 if no source is active — that drives the
    // breaker streak counter forward even with no aggregate to publish.
    const confidence = result?.confidence ?? 0;

    // Step 5: breaker.
    this.advanceBreaker(asset, runtime, confidence, now, correlationId);

    // Step 6: publish + record only when CLOSED/HALF_OPEN with a
    // non-null result. The `!== OPEN` test is the literal definition
    // of "suppress publication on this asset".
    if (result !== null && runtime.breaker.state !== BREAKER.OPEN) {
      const aggregatePrice: AggregatePrice = {
        asset,
        price: result.price,
        confidence: result.confidence,
        contributingSources: result.contributingSources,
        computedAt: now,
      };
      runtime.lastAggregate = aggregatePrice;
      await this.publishAggregate(aggregatePrice, correlationId);
      this.scheduleSnapshot(runtime, aggregatePrice, correlationId);
      // Copy `contributingSources` into a fresh mutable array at the
      // SSE boundary — the inner type is `readonly`, the contract
      // type is plain `T[]`.
      this.emit({
        type: 'aggregate',
        asset,
        data: { ...aggregatePrice, contributingSources: [...aggregatePrice.contributingSources] },
        correlationId,
      });
    }

    // Step 7: anomalies need a reference price; only run if we had
    // an aggregate result this pulse.
    if (result !== null) {
      this.detectAnomalies(asset, runtime, result.price, now, correlationId);
    }
  }

  /**
   * Compute the next breaker state and update the streak counter.
   *
   * The streak update logic is **state-dependent**:
   *
   *  - **CLOSED**: increment streak on below-floor pulses, reset on
   *    at-or-above. The counter is "consecutive bad pulses while
   *    closed" — when it crosses `tripStreak`, we trip.
   *  - **HALF_OPEN**: increment streak on at-or-above (good probes),
   *    reset on below-floor. The counter is "consecutive good
   *    probes" — when it crosses `halfOpenProbeStreak`, we close.
   *  - **OPEN**: streak is meaningless (we are time-gated, not
   *    streak-gated); keep it at 0.
   *
   * After computing the next state via the pure `transitionBreaker`,
   * we reset / set `openedAt` and emit a `BreakerStateChanged` audit
   * event + a `breaker-state` SSE envelope only on actual transitions.
   */
  private advanceBreaker(
    asset: AssetId,
    runtime: AssetRuntime,
    confidence: number,
    now: Millis,
    correlationId: CorrelationId,
  ): void {
    const belowFloor = confidence < this.config.breaker.confidenceFloor;
    const prevBreaker = runtime.breaker.state;

    if (prevBreaker === BREAKER.CLOSED) {
      runtime.breaker.streak = belowFloor ? runtime.breaker.streak + 1 : 0;
    } else if (prevBreaker === BREAKER.HALF_OPEN) {
      runtime.breaker.streak = belowFloor ? 0 : runtime.breaker.streak + 1;
    } else {
      // OPEN: streak is irrelevant; we are time-gated on `openedAt +
      // recoveryWindowMs`. Reset to keep state predictable.
      runtime.breaker.streak = 0;
    }

    const nextBreaker = transitionBreaker(
      prevBreaker,
      { confidence, streak: runtime.breaker.streak, openedAt: runtime.breaker.openedAt },
      now,
      this.config.breaker,
    );

    if (nextBreaker === prevBreaker) {
      // No transition — keep the streak as we just computed and bail
      // before emitting any audit/SSE event.
      runtime.breaker.state = nextBreaker;
      return;
    }

    // Transition: reset streak/openedAt to the next state's
    // canonical "just entered" values.
    if (nextBreaker === BREAKER.OPEN) {
      runtime.breaker.openedAt = now;
      runtime.breaker.streak = 0;
    } else if (nextBreaker === BREAKER.CLOSED) {
      runtime.breaker.openedAt = null;
      runtime.breaker.streak = 0;
    } else {
      // Now HALF_OPEN: probes start fresh.
      runtime.breaker.streak = 0;
    }
    runtime.breaker.state = nextBreaker;

    // Human-readable reason; the dashboard shows this verbatim on the
    // audit timeline. Two-decimal confidence is intentional — enough
    // signal for operators, not so much noise that the line wraps.
    const reason = `confidence ${confidence.toFixed(2)} ${belowFloor ? 'below' : 'at/above'} floor`;
    const event = buildBreakerStateChangedEvent({
      asset,
      from: prevBreaker,
      to: nextBreaker,
      reason,
      at: now,
    });
    // Audit + SSE in parallel. `appendAudit` is fire-and-forget here
    // because audit writes are fail-safe by design (CLAUDE.md
    // operational quirks).
    void this.appendAudit(event, correlationId);
    this.emit({ type: 'audit', data: event, correlationId });
    this.emit({ type: 'breaker-state', asset, data: nextBreaker, correlationId });
  }

  /**
   * Per-source drift anomaly detection with edge-triggered emission.
   *
   * The streak counter (`runtime.anomalyStreaks.get(source)`) is the
   * heart of the dedup: once it reaches `streakLength`, we have
   * emitted the `AnomalyDetected` event and the counter is frozen at
   * or above the threshold. We *only* emit when the counter crosses
   * the threshold (`streak === streakLength` after this pulse), not
   * on every subsequent drifting tick. CLAUDE.md operational quirks:
   * "Anomaly detector is edge-triggered (PRO-45)."
   *
   * On the first non-drifting tick, the counter resets to 0,
   * preparing the source to emit a fresh event on the next
   * sustained drift.
   */
  private detectAnomalies(
    asset: AssetId,
    runtime: AssetRuntime,
    aggregatePrice: number,
    now: Millis,
    correlationId: CorrelationId,
  ): void {
    for (const source of this.config.sources) {
      const state = runtime.sources.get(source);
      if (!state) continue;
      const { triggered, deviationRatio } = detectAnomaly(state, aggregatePrice, this.config.anomaly);
      if (!triggered) {
        // Below threshold — reset the streak. The next sustained
        // drift will start counting from zero, which is exactly what
        // the edge-trigger semantics require.
        runtime.anomalyStreaks.set(source, 0);
        continue;
      }
      const prevStreak = runtime.anomalyStreaks.get(source) ?? 0;
      if (prevStreak >= this.config.anomaly.streakLength) {
        // Already emitted; don't re-emit while the drift persists.
        continue;
      }
      const streak = prevStreak + 1;
      runtime.anomalyStreaks.set(source, streak);
      if (streak < this.config.anomaly.streakLength) {
        // Still gathering evidence.
        continue;
      }
      // Streak just reached threshold — this is the edge. Emit once.
      const event = buildAnomalyDetectedEvent({
        asset,
        source,
        metric: DRIFT_METRIC,
        value: deviationRatio,
        threshold: this.config.anomaly.driftTolerance,
        at: now,
      });
      void this.appendAudit(event, correlationId);
      this.emit({ type: 'audit', data: event, correlationId });
    }
  }

  /**
   * Update one source's FSM state and emit audit / SSE on health
   * transitions. Used by both tick-driven (`routeTick`) and
   * pulse-driven (every source per pulse) paths.
   *
   * The `tick !== null` guard on the `source-health` SSE emit
   * prevents double-emission: pulse-driven updates are already
   * streamed for *every* source by `emitSourceFreshness` higher up
   * in `pulseAsset`. Without the guard, a pulse-driven STALE
   * transition would emit both via this function and via the
   * freshness loop.
   */
  private applySourceUpdate(
    asset: AssetId,
    source: SourceId,
    tick: Tick | null,
    now: Millis,
    correlationId: CorrelationId,
  ): void {
    const runtime = this.runtime.get(asset);
    if (!runtime) return;
    const prev = runtime.sources.get(source);
    if (!prev) return;
    const next = updateSourceState(prev, tick, now, this.config.thresholds);
    runtime.sources.set(source, next);

    if (next.health === prev.health) return;

    const event = buildSourceStateChangedEvent({
      asset,
      source,
      from: prev.health,
      to: next.health,
      at: now,
    });
    this.emit({ type: 'audit', data: event, correlationId });
    // pulse-driven (tick=null) transitions are already streamed by emitSourceFreshness this pulse
    if (tick !== null) {
      this.emit({ type: 'source-health', asset, data: next, correlationId });
    }
    void this.appendAudit(event, correlationId);
  }

  /**
   * Stream the full per-source snapshot for an asset to SSE listeners.
   * Called once per pulse so the dashboard's "X seconds since last
   * tick" labels animate continuously, even when no source health
   * actually changed this pulse.
   */
  private emitSourceFreshness(
    asset: AssetId,
    runtime: AssetRuntime,
    correlationId: CorrelationId,
  ): void {
    for (const state of runtime.sources.values()) {
      this.emit({ type: 'source-health', asset, data: state, correlationId });
    }
  }

  /**
   * Fail-safe `AuditPort.append`. The port itself is contractually
   * fail-safe (see `audit.port.ts`), but we still try/catch here
   * because a buggy adapter must not crash the hot path. CLAUDE.md
   * operational quirks: "MongoDB writes are off the hot publish path."
   */
  private async appendAudit(event: AuditEvent, correlationId: CorrelationId): Promise<void> {
    try {
      await this.deps.audit.append(event);
    } catch (err) {
      this.deps.logger.warn(
        {
          event: 'orchestrator.audit-failed',
          auditType: event.type,
          asset: event.asset,
          correlationId,
          error: errorMessage(err),
        },
        'Audit append failed',
      );
    }
  }

  /**
   * Fail-safe `PublishPort.publishAggregate`. CLAUDE.md rule 20:
   * publish failures are recoverable boundary failures, log at `warn`
   * and continue. The next pulse will publish a fresh aggregate; a
   * single lost publish is acceptable under the "lossy by design"
   * NATS-Core stance (`decisions.md` Entry 2).
   */
  private async publishAggregate(
    aggregatePrice: AggregatePrice,
    correlationId: CorrelationId,
  ): Promise<void> {
    try {
      await this.deps.publisher.publishAggregate(aggregatePrice, correlationId);
    } catch (err) {
      this.deps.logger.warn(
        {
          event: 'orchestrator.publish-failed',
          asset: aggregatePrice.asset,
          correlationId,
          error: errorMessage(err),
        },
        'Aggregate publish failed',
      );
    }
  }

  /**
   * Enqueue a snapshot write. Coalesces aggressively: if a previous
   * write is still draining, we just replace `snapshotPending` with
   * the latest aggregate. The drain loop picks up the most-recent
   * value on its next iteration.
   *
   * The point: a slow Mongo must never let aggregates pile up in
   * memory. There is exactly one in-flight write per asset; the
   * pending slot holds at most one (always the latest) value.
   */
  private scheduleSnapshot(
    runtime: AssetRuntime,
    aggregatePrice: AggregatePrice,
    correlationId: CorrelationId,
  ): void {
    runtime.snapshotPending = aggregatePrice;
    if (runtime.snapshotDraining) return;
    runtime.snapshotDraining = true;
    void this.drainSnapshots(runtime, correlationId);
  }

  /**
   * Per-asset drain loop. While there is a pending snapshot, write
   * it and check again — the next pulse may have replaced
   * `snapshotPending` while we were awaiting. The `finally` ensures
   * `snapshotDraining` is cleared even if `recordSnapshot` threw
   * (which it won't, because it is fail-safe, but defensive).
   */
  private async drainSnapshots(runtime: AssetRuntime, correlationId: CorrelationId): Promise<void> {
    try {
      while (runtime.snapshotPending !== null) {
        const next = runtime.snapshotPending;
        runtime.snapshotPending = null;
        await this.recordSnapshot(next, correlationId);
      }
    } finally {
      runtime.snapshotDraining = false;
    }
  }

  /**
   * Fail-safe `AuditPort.recordAggregate`. Same rationale as
   * `appendAudit` — a slow or down Mongo must not affect the publish
   * path. The snapshot exists for restart recovery only; missing one
   * write means the snapshot endpoint serves a slightly older value
   * until the next pulse persists a fresh one.
   */
  private async recordSnapshot(
    aggregatePrice: AggregatePrice,
    correlationId: CorrelationId,
  ): Promise<void> {
    try {
      await this.deps.audit.recordAggregate(aggregatePrice);
    } catch (err) {
      this.deps.logger.warn(
        {
          event: 'orchestrator.record-aggregate-failed',
          asset: aggregatePrice.asset,
          correlationId,
          error: errorMessage(err),
        },
        'Aggregate snapshot record failed',
      );
    }
  }

  /**
   * Emit one SSE envelope. The try/catch isolates a buggy listener
   * (a hung dashboard tab, an exception in a downstream consumer)
   * from the orchestrator's hot path — node's EventEmitter would
   * otherwise propagate a synchronous throw back into `pulseAsset`.
   */
  private emit(envelope: SseEnvelope): void {
    try {
      this.emitter.emit(SSE_EVENT, envelope);
    } catch (err) {
      this.deps.logger.warn(
        { event: 'orchestrator.listener-failed', error: errorMessage(err) },
        'SSE listener threw',
      );
    }
  }
}
