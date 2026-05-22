import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { type NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type IngestorConfig } from '../config/env.schema.js';

import { ChaosStateService } from './chaos-state.service.js';
import { TickGeneratorService } from './tick-generator.service.js';

import type { z } from 'zod';

type Captured =
  | {
      kind: 'contract';
      schema: z.ZodType<unknown>;
      subject: string;
      payload: unknown;
      correlationId: string;
    }
  | { kind: 'raw'; subject: string; body: string; correlationId: string };

const buildFakeNats = (): { fake: NatsService; captured: Captured[] } => {
  const captured: Captured[] = [];
  const fake = {
    publishContract: vi.fn(
      (schema: z.ZodType<unknown>, subject: string, payload: unknown, correlationId: string) => {
        captured.push({ kind: 'contract', schema, subject, payload, correlationId });
      },
    ),
    publishRaw: vi.fn((subject: string, body: string, correlationId: string) => {
      captured.push({ kind: 'raw', subject, body, correlationId });
    }),
  } as unknown as NatsService;
  return { fake, captured };
};

const buildConfig = (overrides: Partial<IngestorConfig> = {}): IngestorConfig => ({
  httpPort: 7401,
  tickIntervalMs: 250,
  btcAnchorUsd: 95_000,
  ethAnchorUsd: 3_500,
  priceVolatilityPct: 0.001,
  adminEnabled: true,
  natsUrl: 'nats://localhost:4222',
  ...overrides,
});

const fakeLogger = {
  setContext: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger;

describe('TickGeneratorService', () => {
  let chaos: ChaosStateService;
  let nats: NatsService;
  let captured: Captured[];
  let svc: TickGeneratorService;

  beforeEach(() => {
    vi.useFakeTimers();
    chaos = new ChaosStateService();
    const built = buildFakeNats();
    nats = built.fake;
    captured = built.captured;
    svc = new TickGeneratorService(buildConfig(), nats, chaos, fakeLogger);
  });

  afterEach(() => {
    svc.onModuleDestroy();
    vi.useRealTimers();
  });

  it('should publish a tick for both assets within 100 ms of module init', async () => {
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(50);
    const subjects = captured.map((c) => c.subject);
    expect(subjects).toContain(ticksSubject('btc', 'mock'));
    expect(subjects).toContain(ticksSubject('eth', 'mock'));
  });

  it('should publish a healthy tick for both assets on each interval', async () => {
    svc.onModuleInit();
    captured.length = 0;
    await vi.advanceTimersByTimeAsync(250);
    expect(captured.filter((c) => c.subject === ticksSubject('btc', 'mock'))).toHaveLength(1);
    expect(captured.filter((c) => c.subject === ticksSubject('eth', 'mock'))).toHaveLength(1);
  });

  it('should skip publish for the disconnected asset only', async () => {
    svc.onModuleInit();
    captured.length = 0;
    chaos.setDisconnected('btc', Date.now());
    await vi.advanceTimersByTimeAsync(250);
    expect(captured.find((c) => c.subject === ticksSubject('btc', 'mock'))).toBeUndefined();
    expect(captured.find((c) => c.subject === ticksSubject('eth', 'mock'))).toBeDefined();
  });

  it('should publish frozen price for stale asset', async () => {
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(250);
    const lastBtc = svc.lastPublished('btc');
    expect(lastBtc).not.toBeNull();
    chaos.setStale('btc', Date.now(), lastBtc!.price, lastBtc!.sourceTimestamp);
    captured.length = 0;
    await vi.advanceTimersByTimeAsync(750);
    const btcPublishes = captured.filter(
      (c): c is Extract<Captured, { kind: 'contract' }> =>
        c.kind === 'contract' && c.subject === ticksSubject('btc', 'mock'),
    );
    expect(btcPublishes.length).toBeGreaterThanOrEqual(2);
    for (const p of btcPublishes) {
      const parsed = TickSchema.parse(p.payload);
      expect(parsed.price).toBe(lastBtc!.price);
      expect(parsed.sourceTimestamp).toBe(lastBtc!.sourceTimestamp);
    }
  });

  it('should publish null-price payload via publishRaw for malformed asset', async () => {
    svc.onModuleInit();
    chaos.setMalformed('eth', Date.now());
    captured.length = 0;
    await vi.advanceTimersByTimeAsync(250);
    const ethPublish = captured.find((c) => c.subject === ticksSubject('eth', 'mock'));
    expect(ethPublish).toBeDefined();
    expect(ethPublish!.kind).toBe('raw');
    const body = JSON.parse((ethPublish as Extract<Captured, { kind: 'raw' }>).body) as Record<
      string,
      unknown
    >;
    expect(body.price).toBeNull();
    const validation = TickSchema.safeParse(body);
    expect(validation.success).toBe(false);
  });

  it('should attach a correlation id to every publish', async () => {
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(500);
    expect(captured.length).toBeGreaterThan(0);
    for (const c of captured) {
      expect(c.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
