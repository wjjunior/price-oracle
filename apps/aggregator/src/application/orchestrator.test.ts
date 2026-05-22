import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Orchestrator } from './orchestrator.js';

import type { OrchestratorConfig, OrchestratorDeps } from './orchestrator.js';
import type { AuditPort } from '../domain/ports/audit.port.js';
import type { PublishPort } from '../domain/ports/publish.port.js';
import type { SourceStreamPort, Unsubscribe } from '../domain/ports/source-stream.port.js';
import type { AggregatePrice, Tick } from '../domain/types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, CorrelationId, Millis, SourceId } from '@price-oracle/contracts/primitives';
import type { SseEnvelope } from '@price-oracle/contracts/sse';
import type { Logger } from 'pino';

type CapturedOnTick = (tick: Tick, correlationId: CorrelationId) => void;

const config: OrchestratorConfig = {
  assets: ['btc', 'eth'],
  sources: ['binance', 'coinbase', 'mock'],
  aggregationIntervalMs: 500,
  thresholds: {
    freshnessDecayMs: 10_000,
    degradedAfterMs: 2_000,
    staleAfterMs: 5_000,
    healthHysteresisStreak: 1,
  },
  breaker: {
    confidenceFloor: 0.5,
    tripStreak: 3,
    recoveryWindowMs: 30_000,
    halfOpenProbeStreak: 2,
  },
  anomaly: {
    driftTolerance: 5,
    streakLength: 2,
  },
};

const tick = (asset: AssetId, source: SourceId, price: number, receivedAt: Millis): Tick => ({
  asset,
  source,
  price,
  receivedAt,
});

class FakeSourceStream implements SourceStreamPort {
  onTick: CapturedOnTick | null = null;
  unsubscribed = false;
  subscribe(onTick: CapturedOnTick): Unsubscribe {
    this.onTick = onTick;
    return (): void => {
      this.unsubscribed = true;
    };
  }
}

class FakePublisher implements PublishPort {
  readonly calls: Array<{ aggregate: AggregatePrice; correlationId: CorrelationId }> = [];
  rejectWith: Error | null = null;
  async publishAggregate(aggregate: AggregatePrice, correlationId: CorrelationId): Promise<void> {
    if (this.rejectWith) throw this.rejectWith;
    this.calls.push({ aggregate, correlationId });
  }
}

class FakeAudit implements AuditPort {
  readonly appended: AuditEvent[] = [];
  readonly recordStarted: AggregatePrice[] = [];
  readonly recorded: AggregatePrice[] = [];
  readonly snapshots = new Map<AssetId, AggregatePrice | null>();
  rejectAppend: Error | null = null;
  rejectRecord: Error | null = null;
  recordBarrier: Promise<void> | null = null;
  async append(event: AuditEvent): Promise<void> {
    if (this.rejectAppend) throw this.rejectAppend;
    this.appended.push(event);
  }
  async recent(): Promise<readonly AuditEvent[]> {
    return [];
  }
  async recordAggregate(aggregate: AggregatePrice): Promise<void> {
    this.recordStarted.push(aggregate);
    if (this.recordBarrier) await this.recordBarrier;
    if (this.rejectRecord) throw this.rejectRecord;
    this.recorded.push(aggregate);
    this.snapshots.set(aggregate.asset, aggregate);
  }
  async lastKnownAggregate(asset: AssetId): Promise<AggregatePrice | null> {
    return this.snapshots.get(asset) ?? null;
  }
}

const flushMicrotasks = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeLogger = (): Logger =>
  ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as Logger;

type Harness = {
  orchestrator: Orchestrator;
  stream: FakeSourceStream;
  publisher: FakePublisher;
  audit: FakeAudit;
  logger: Logger;
  events: SseEnvelope[];
  setNow: (value: Millis) => void;
};

const setup = (overrides: Partial<OrchestratorConfig> = {}): Harness => {
  const stream = new FakeSourceStream();
  const publisher = new FakePublisher();
  const audit = new FakeAudit();
  const logger = makeLogger();
  let nowValue: Millis = 1_000_000;
  const deps: OrchestratorDeps = {
    sourceStream: stream,
    publisher,
    audit,
    logger,
    now: () => nowValue,
  };
  const orchestrator = new Orchestrator({ ...config, ...overrides }, deps);
  const events: SseEnvelope[] = [];
  orchestrator.onEvent((envelope) => events.push(envelope));
  return {
    orchestrator,
    stream,
    publisher,
    audit,
    logger,
    events,
    setNow: (value: Millis): void => {
      nowValue = value;
    },
  };
};

const feedHealthy = (
  orchestrator: Orchestrator,
  asset: AssetId,
  sources: readonly SourceId[],
  price: number,
  receivedAt: Millis,
): void => {
  for (const source of sources) {
    orchestrator.routeTick(tick(asset, source, price, receivedAt), 'cid');
  }
};

describe('Orchestrator', () => {
  let h: Harness;

  beforeEach(() => {
    h = setup();
  });

  it('should publish a per-asset aggregate on a pulse when sources are healthy and the breaker is closed', async () => {
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);

    await h.orchestrator.pulse(1_000_000);

    const btcPublish = h.publisher.calls.filter((c) => c.aggregate.asset === 'btc');
    expect(btcPublish).toHaveLength(1);
    expect(btcPublish[0]?.aggregate.price).toBe(50_000);
    expect(btcPublish[0]?.correlationId).toBeTruthy();

    const aggregateEvents = h.events.filter(
      (e): e is Extract<SseEnvelope, { type: 'aggregate' }> =>
        e.type === 'aggregate' && e.asset === 'btc',
    );
    expect(aggregateEvents).toHaveLength(1);
    expect(aggregateEvents[0]?.data.price).toBe(50_000);
  });

  it('should isolate assets: routing ticks on eth does not change btc state or btc publication', async () => {
    feedHealthy(h.orchestrator, 'eth', config.sources, 3_000, 1_000_000);

    await h.orchestrator.pulse(1_000_000);

    expect(h.publisher.calls.some((c) => c.aggregate.asset === 'eth')).toBe(true);
    expect(h.publisher.calls.some((c) => c.aggregate.asset === 'btc')).toBe(false);
    expect(h.orchestrator.getSnapshot('btc')).toBeNull();
  });

  it('should emit a SourceStateChanged audit event and source-health SSE when a source transitions', async () => {
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);
    await h.orchestrator.pulse(1_000_000);

    const before = h.audit.appended.length;
    await h.orchestrator.pulse(1_010_000);

    const sourceChanges = h.audit.appended
      .slice(before)
      .filter((e) => e.type === 'SourceStateChanged' && e.asset === 'btc');
    expect(sourceChanges.length).toBeGreaterThan(0);
    expect(sourceChanges.every((e) => e.type === 'SourceStateChanged' && e.to === 'STALE')).toBe(
      true,
    );

    const healthEvents = h.events.filter((e) => e.type === 'source-health' && e.asset === 'btc');
    expect(healthEvents.length).toBeGreaterThan(0);
  });

  it('should open the breaker after tripStreak below-floor pulses and emit a BreakerStateChanged audit + breaker-state SSE', async () => {
    for (let i = 0; i < config.breaker.tripStreak; i += 1) {
      await h.orchestrator.pulse(1_000_000 + i);
    }

    const breakerAudits = h.audit.appended.filter(
      (e) => e.type === 'BreakerStateChanged' && e.asset === 'btc' && e.to === 'OPEN',
    );
    expect(breakerAudits).toHaveLength(1);

    const breakerEvents = h.events.filter(
      (e): e is Extract<SseEnvelope, { type: 'breaker-state' }> =>
        e.type === 'breaker-state' && e.asset === 'btc',
    );
    expect(breakerEvents.some((e) => e.data === 'OPEN')).toBe(true);
  });

  it('should suppress aggregate publication while the breaker is OPEN', async () => {
    for (let i = 0; i < config.breaker.tripStreak; i += 1) {
      await h.orchestrator.pulse(1_000_000 + i);
    }
    const callsAfterOpen = h.publisher.calls.length;

    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_500);
    await h.orchestrator.pulse(1_000_500);

    expect(h.publisher.calls.length).toBe(callsAfterOpen);
  });

  it('should recover the breaker OPEN -> HALF_OPEN -> CLOSED', async () => {
    const open = 1_000_000;
    for (let i = 0; i < config.breaker.tripStreak; i += 1) {
      await h.orchestrator.pulse(open + i);
    }
    expect(
      h.audit.appended.some(
        (e) => e.type === 'BreakerStateChanged' && e.to === 'OPEN' && e.asset === 'btc',
      ),
    ).toBe(true);

    const afterRecovery = open + config.breaker.recoveryWindowMs + 1_000;
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, afterRecovery);
    await h.orchestrator.pulse(afterRecovery);

    expect(
      h.audit.appended.some(
        (e) => e.type === 'BreakerStateChanged' && e.to === 'HALF_OPEN' && e.asset === 'btc',
      ),
    ).toBe(true);

    for (let i = 1; i <= config.breaker.halfOpenProbeStreak; i += 1) {
      feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, afterRecovery + i);
      await h.orchestrator.pulse(afterRecovery + i);
    }

    expect(
      h.audit.appended.some(
        (e) => e.type === 'BreakerStateChanged' && e.to === 'CLOSED' && e.asset === 'btc',
      ),
    ).toBe(true);
  });

  it('should re-open the breaker on a single below-floor probe while HALF_OPEN', async () => {
    const open = 1_000_000;
    for (let i = 0; i < config.breaker.tripStreak; i += 1) {
      await h.orchestrator.pulse(open + i);
    }

    const afterRecovery = open + config.breaker.recoveryWindowMs + 1_000;
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, afterRecovery);
    await h.orchestrator.pulse(afterRecovery);
    expect(
      h.audit.appended.some(
        (e) => e.type === 'BreakerStateChanged' && e.to === 'HALF_OPEN' && e.asset === 'btc',
      ),
    ).toBe(true);

    const before = h.audit.appended.length;
    const reopenAt = afterRecovery + config.thresholds.staleAfterMs + 1_000;
    await h.orchestrator.pulse(reopenAt);

    const reopen = h.audit.appended
      .slice(before)
      .filter((e) => e.type === 'BreakerStateChanged' && e.to === 'OPEN' && e.asset === 'btc');
    expect(reopen).toHaveLength(1);
  });

  it('should emit an AnomalyDetected audit event after streakLength consecutive drift cycles', async () => {
    const now = 1_000_000;
    for (let i = 0; i <= config.anomaly.streakLength; i += 1) {
      h.orchestrator.routeTick(tick('btc', 'binance', 50_000, now + i), 'cid');
      h.orchestrator.routeTick(tick('btc', 'coinbase', 50_000, now + i), 'cid');
      h.orchestrator.routeTick(tick('btc', 'mock', 60_000, now + i), 'cid');
      await h.orchestrator.pulse(now + i);
    }

    const anomalies = h.audit.appended.filter(
      (e) => e.type === 'AnomalyDetected' && e.asset === 'btc' && e.source === 'mock',
    );
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]?.type === 'AnomalyDetected' && anomalies[0].metric).toBe('price-drift');
  });

  it('should hydrate lastKnownAggregate per asset on start and serve it via getSnapshot', async () => {
    const hydrated: AggregatePrice = {
      asset: 'btc',
      price: 42_000,
      confidence: 0.9,
      contributingSources: ['binance'],
      computedAt: 999_000,
    };
    h.audit.snapshots.set('btc', hydrated);

    vi.useFakeTimers();
    try {
      await h.orchestrator.start();
      expect(h.orchestrator.getSnapshot('btc')).toEqual(hydrated);
      expect(h.orchestrator.getSnapshot('eth')).toBeNull();
    } finally {
      h.orchestrator.stop();
      vi.useRealTimers();
    }
  });

  it('should persist each published aggregate via recordAggregate', async () => {
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);

    await h.orchestrator.pulse(1_000_000);
    await flushMicrotasks();

    const snapshot = h.orchestrator.getSnapshot('btc');
    expect(snapshot).not.toBeNull();
    expect(h.audit.recorded).toContainEqual(snapshot);
  });

  it('should keep at most one snapshot write in flight per asset and collapse to the latest', async () => {
    let release = (): void => {};
    h.audit.recordBarrier = new Promise<void>((resolve) => {
      release = resolve;
    });

    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);
    await h.orchestrator.pulse(1_000_000);
    feedHealthy(h.orchestrator, 'btc', config.sources, 51_000, 1_000_100);
    await h.orchestrator.pulse(1_000_100);
    feedHealthy(h.orchestrator, 'btc', config.sources, 52_000, 1_000_200);
    await h.orchestrator.pulse(1_000_200);

    expect(h.audit.recordStarted).toHaveLength(1);
    expect(h.audit.recorded).toHaveLength(0);

    release();
    await flushMicrotasks();

    // First write completes, the intermediate snapshot is collapsed, the latest is written.
    expect(h.audit.recorded).toHaveLength(2);
    expect(h.audit.recorded.at(-1)?.price).toBe(h.orchestrator.getSnapshot('btc')?.price);
  });

  it('should not throw when recordAggregate rejects and should log a warn', async () => {
    h.audit.rejectRecord = new Error('mongo down');
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);

    await expect(h.orchestrator.pulse(1_000_000)).resolves.toBeUndefined();
    await flushMicrotasks();
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it('should subscribe on start and unsubscribe on stop', async () => {
    vi.useFakeTimers();
    try {
      await h.orchestrator.start();
      expect(h.stream.onTick).not.toBeNull();
      h.orchestrator.stop();
      expect(h.stream.unsubscribed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not throw when the publisher rejects and should log a warn', async () => {
    h.publisher.rejectWith = new Error('nats down');
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);

    await expect(h.orchestrator.pulse(1_000_000)).resolves.toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it('should not throw when audit append rejects and should log a warn', async () => {
    h.audit.rejectAppend = new Error('mongo down');
    for (let i = 0; i < config.breaker.tripStreak; i += 1) {
      await expect(h.orchestrator.pulse(1_000_000 + i)).resolves.toBeUndefined();
    }
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it('should contain a throwing SSE listener and keep the pulse resilient', async () => {
    h.orchestrator.onEvent(() => {
      throw new Error('listener boom');
    });
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);

    await expect(h.orchestrator.pulse(1_000_000)).resolves.toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'orchestrator.listener-failed' }),
      expect.any(String),
    );
    expect(h.publisher.calls.some((c) => c.aggregate.asset === 'btc')).toBe(true);
  });

  it('should return the per-asset source states via getSourceStates after routing ticks', () => {
    feedHealthy(h.orchestrator, 'btc', config.sources, 50_000, 1_000_000);

    const states = h.orchestrator.getSourceStates('btc');
    expect(states.map((s) => s.source).sort((a, b) => a.localeCompare(b))).toEqual(
      [...config.sources].sort((a, b) => a.localeCompare(b)),
    );
    expect(states.every((s) => s.asset === 'btc')).toBe(true);
    expect(states.some((s) => s.lastPrice === 50_000)).toBe(true);
  });

  it('should return an empty array from getSourceStates for an unknown asset', () => {
    expect(h.orchestrator.getSourceStates('sol' as AssetId)).toEqual([]);
  });

  it('should reflect breaker transitions via getBreakerState', async () => {
    expect(h.orchestrator.getBreakerState('btc')).toBe('CLOSED');

    for (let i = 0; i < config.breaker.tripStreak; i += 1) {
      await h.orchestrator.pulse(1_000_000 + i);
    }

    expect(h.orchestrator.getBreakerState('btc')).toBe('OPEN');
  });

  it('should return CLOSED from getBreakerState for an unknown asset', () => {
    expect(h.orchestrator.getBreakerState('sol' as AssetId)).toBe('CLOSED');
  });
});
