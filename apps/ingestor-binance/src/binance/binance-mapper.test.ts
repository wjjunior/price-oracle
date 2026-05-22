import { readFileSync } from 'node:fs';

import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type IngestorConfig } from '../config/env.schema.js';
import { type NatsService } from '../nats/nats.service.js';

import { assetFromBinanceSymbol } from './binance-symbols.js';
import { BinanceService } from './binance.service.js';
import { BinanceCombinedTradeEnvelopeSchema } from './trade-event.schema.js';

import type { z } from 'zod';

const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));

type Captured = {
  schema: z.ZodType<unknown>;
  subject: string;
  payload: unknown;
  correlationId: string;
};

const buildFakeNats = (): { fake: NatsService; captured: Captured[] } => {
  const captured: Captured[] = [];
  const fake = {
    publishContract: vi.fn(
      (schema: z.ZodType<unknown>, subject: string, payload: unknown, correlationId: string) => {
        captured.push({ schema, subject, payload, correlationId });
      },
    ),
    publishRaw: vi.fn(),
  } as unknown as NatsService;
  return { fake, captured };
};

const buildConfig = (overrides: Partial<IngestorConfig> = {}): IngestorConfig => ({
  binanceWsUrl: 'wss://stream.binance.com:9443/stream?streams=btcusdt@trade',
  natsUrl: 'nats://localhost:4222',
  ...overrides,
});

const fakeLogger = {
  setContext: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as PinoLogger;

describe('BinanceCombinedTradeEnvelopeSchema', () => {
  it('should parse a valid combined trade frame', () => {
    expect(BinanceCombinedTradeEnvelopeSchema.safeParse(readFixture('trade.json')).success).toBe(
      true,
    );
  });

  it('should reject a frame missing data.p', () => {
    const trade = readFixture('trade.json') as { data: Record<string, unknown> };
    delete trade.data.p;
    expect(BinanceCombinedTradeEnvelopeSchema.safeParse(trade).success).toBe(false);
  });

  it('should reject a frame whose p is a number instead of a numeric string', () => {
    const trade = readFixture('trade.json') as { data: Record<string, unknown> };
    trade.data.p = 95000.5;
    expect(BinanceCombinedTradeEnvelopeSchema.safeParse(trade).success).toBe(false);
  });
});

describe('assetFromBinanceSymbol', () => {
  it('should map a known symbol to its asset', () => {
    expect(assetFromBinanceSymbol('BTCUSDT')).toBe('btc');
  });

  it('should return undefined for an unknown symbol', () => {
    expect(assetFromBinanceSymbol('XRPUSDT')).toBeUndefined();
  });
});

describe('BinanceService.handleMessage', () => {
  let nats: NatsService;
  let captured: Captured[];
  let svc: BinanceService;

  beforeEach(() => {
    const built = buildFakeNats();
    nats = built.fake;
    captured = built.captured;
    svc = new BinanceService(buildConfig(), nats, fakeLogger);
  });

  it('should publish a mapped tick for a valid trade frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('trade.json'))));
    expect(captured).toHaveLength(1);
    const first = captured[0];
    if (first === undefined) {
      expect.fail('expected exactly one captured publish');
    }
    expect(first.subject).toBe(ticksSubject('btc', 'binance'));
    const tick = TickSchema.parse(first.payload);
    expect(tick).toMatchObject({ asset: 'btc', source: 'binance', price: 95000.5 });
    expect(tick.sourceTimestamp).toBe(1700000000120);
    expect(first.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should publish a mapped tick for an ETH trade frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('trade-eth.json'))));
    expect(captured).toHaveLength(1);
    const first = captured[0];
    if (first === undefined) {
      expect.fail('expected exactly one captured publish');
    }
    expect(first.subject).toBe(ticksSubject('eth', 'binance'));
    const tick = TickSchema.parse(first.payload);
    expect(tick).toMatchObject({ asset: 'eth', source: 'binance', price: 3500.25 });
  });

  it('should warn ws.frame.unknown_symbol and not publish for an unknown symbol', () => {
    const trade = readFixture('trade.json') as { data: Record<string, unknown> };
    trade.data.s = 'XRPUSDT';
    svc.handleMessage(Buffer.from(JSON.stringify(trade)));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.frame.unknown_symbol' }),
      expect.any(String),
    );
  });

  it('should warn ws.frame.schema_invalid and not publish for a non-trade frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('subscription-ack.json'))));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.frame.schema_invalid' }),
      expect.any(String),
    );
  });

  it('should warn ws.frame.invalid_json and not publish for a non-JSON buffer', () => {
    svc.handleMessage(Buffer.from('not json'));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.frame.invalid_json' }),
      expect.any(String),
    );
  });
});
