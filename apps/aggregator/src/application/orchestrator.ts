import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

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

const BREAKER = {
  CLOSED: 'CLOSED',
  HALF_OPEN: 'HALF_OPEN',
  OPEN: 'OPEN',
} as const satisfies Record<BreakerState, BreakerState>;

const SSE_EVENT = 'sse';
const DRIFT_METRIC = 'price-drift';
const INITIAL_HEALTH = 'STALE';

export type OrchestratorConfig = {
  readonly assets: readonly AssetId[];
  readonly sources: readonly SourceId[];
  readonly aggregationIntervalMs: Millis;
  readonly thresholds: Thresholds;
  readonly breaker: BreakerConfig;
  readonly anomaly: AnomalyConfig;
};

export type OrchestratorDeps = {
  readonly sourceStream: SourceStreamPort;
  readonly publisher: PublishPort;
  readonly audit: AuditPort;
  readonly logger: Logger;
  readonly now?: () => Millis;
};

type BreakerRuntime = { state: BreakerState; streak: number; openedAt: Millis | null };

type AssetRuntime = {
  readonly sources: Map<SourceId, SourceState>;
  breaker: BreakerRuntime;
  readonly anomalyStreaks: Map<SourceId, number>;
  lastAggregate: AggregatePrice | null;
};

export class Orchestrator {
  private readonly now: () => Millis;
  private readonly runtime: Map<AssetId, AssetRuntime>;
  private readonly emitter = new EventEmitter();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: Unsubscribe | null = null;

  constructor(
    private readonly config: OrchestratorConfig,
    private readonly deps: OrchestratorDeps,
  ) {
    this.now = deps.now ?? ((): Millis => Date.now());
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
      });
    }
  }

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
      void this.pulse(this.now());
    }, this.config.aggregationIntervalMs);
    this.deps.logger.info({ event: 'orchestrator.start' }, 'Orchestrator started');
  }

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

  routeTick(tick: Tick, correlationId: CorrelationId): void {
    const runtime = this.runtime.get(tick.asset);
    if (!runtime?.sources.has(tick.source)) {
      this.deps.logger.warn(
        { event: 'orchestrator.unknown-tick', asset: tick.asset, sourceId: tick.source, correlationId },
        'Dropping tick for unknown asset or source',
      );
      return;
    }
    void this.applySourceUpdate(tick.asset, tick.source, tick, this.now(), correlationId);
  }

  async pulse(now: Millis): Promise<void> {
    for (const asset of this.config.assets) {
      const runtime = this.runtime.get(asset);
      if (!runtime) continue;
      await this.pulseAsset(asset, runtime, now);
    }
  }

  getSnapshot(asset: AssetId): AggregatePrice | null {
    return this.runtime.get(asset)?.lastAggregate ?? null;
  }

  onEvent(listener: (envelope: SseEnvelope) => void): () => void {
    this.emitter.on(SSE_EVENT, listener);
    return (): void => {
      this.emitter.off(SSE_EVENT, listener);
    };
  }

  private async pulseAsset(asset: AssetId, runtime: AssetRuntime, now: Millis): Promise<void> {
    const correlationId: CorrelationId = randomUUID();

    for (const source of this.config.sources) {
      await this.applySourceUpdate(asset, source, null, now, correlationId);
    }

    const states = [...runtime.sources.values()];
    const result = aggregate(states, now, this.config.thresholds);
    const confidence = result?.confidence ?? 0;

    this.advanceBreaker(asset, runtime, confidence, now, correlationId);

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
      this.emit({
        type: 'aggregate',
        asset,
        data: { ...aggregatePrice, contributingSources: [...aggregatePrice.contributingSources] },
        correlationId,
      });
    }

    if (result !== null) {
      this.detectAnomalies(asset, runtime, result.price, now, correlationId);
    }
  }

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
      runtime.breaker.streak = 0;
    }

    const nextBreaker = transitionBreaker(
      prevBreaker,
      { confidence, streak: runtime.breaker.streak, openedAt: runtime.breaker.openedAt },
      now,
      this.config.breaker,
    );

    if (nextBreaker === prevBreaker) {
      runtime.breaker.state = nextBreaker;
      return;
    }

    if (nextBreaker === BREAKER.OPEN) {
      runtime.breaker.openedAt = now;
      runtime.breaker.streak = 0;
    } else if (nextBreaker === BREAKER.CLOSED) {
      runtime.breaker.openedAt = null;
      runtime.breaker.streak = 0;
    } else {
      runtime.breaker.streak = 0;
    }
    runtime.breaker.state = nextBreaker;

    const reason = `confidence ${confidence.toFixed(2)} ${belowFloor ? 'below' : 'at/above'} floor`;
    const event = buildBreakerStateChangedEvent({
      asset,
      from: prevBreaker,
      to: nextBreaker,
      reason,
      at: now,
    });
    void this.appendAudit(event, correlationId);
    this.emit({ type: 'audit', data: event, correlationId });
    this.emit({ type: 'breaker-state', asset, data: nextBreaker, correlationId });
  }

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
        runtime.anomalyStreaks.set(source, 0);
        continue;
      }
      const streak = (runtime.anomalyStreaks.get(source) ?? 0) + 1;
      if (streak < this.config.anomaly.streakLength) {
        runtime.anomalyStreaks.set(source, streak);
        continue;
      }
      runtime.anomalyStreaks.set(source, 0);
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

  private async applySourceUpdate(
    asset: AssetId,
    source: SourceId,
    tick: Tick | null,
    now: Millis,
    correlationId: CorrelationId,
  ): Promise<void> {
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
    await this.appendAudit(event, correlationId);
    this.emit({ type: 'audit', data: event, correlationId });
    this.emit({ type: 'source-health', asset, data: next, correlationId });
  }

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
          error: err instanceof Error ? err.message : String(err),
        },
        'Audit append failed',
      );
    }
  }

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
          error: err instanceof Error ? err.message : String(err),
        },
        'Aggregate publish failed',
      );
    }
  }

  private emit(envelope: SseEnvelope): void {
    this.emitter.emit(SSE_EVENT, envelope);
  }
}
