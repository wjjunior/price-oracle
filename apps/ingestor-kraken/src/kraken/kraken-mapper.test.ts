import { readFileSync } from 'node:fs';

import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { type NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type IngestorConfig } from '../config/env.schema.js';

import { KrakenService } from './kraken.service.js';
import { KrakenTradeSchema, TradeFrameSchema } from './trade.schema.js';

import type { z } from 'zod';

const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));

type TradeFrameShape = { data: Record<string, unknown>[] };

const firstTradeFromFrame = (frame: TradeFrameShape): Record<string, unknown> => {
  const trade = frame.data[0];
  if (trade === undefined) {
    expect.fail('fixture must have at least one trade');
  }
  return trade;
};

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
  krakenWsUrl: 'wss://ws.kraken.com/v2',
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

describe('TradeFrameSchema', () => {
  it('should parse a trade update frame', () => {
    expect(TradeFrameSchema.safeParse(readFixture('trade.json')).success).toBe(true);
  });

  it('should parse a trade snapshot frame', () => {
    expect(TradeFrameSchema.safeParse(readFixture('trade-snapshot.json')).success).toBe(true);
  });
});

describe('KrakenTradeSchema', () => {
  const tradeFixture = (): Record<string, unknown> =>
    firstTradeFromFrame(readFixture('trade.json') as TradeFrameShape);

  it('should reject a trade missing price', () => {
    const trade = tradeFixture();
    delete trade.price;
    expect(KrakenTradeSchema.safeParse(trade).success).toBe(false);
  });

  it('should reject a trade with a non-numeric price', () => {
    const trade = tradeFixture();
    trade.price = '95000.5';
    expect(KrakenTradeSchema.safeParse(trade).success).toBe(false);
  });

  it('should reject a trade with an invalid side', () => {
    const trade = tradeFixture();
    trade.side = 'hold';
    expect(KrakenTradeSchema.safeParse(trade).success).toBe(false);
  });
});

describe('KrakenService.handleMessage', () => {
  let nats: NatsService;
  let captured: Captured[];
  let svc: KrakenService;

  beforeEach(() => {
    const built = buildFakeNats();
    nats = built.fake;
    captured = built.captured;
    svc = new KrakenService(buildConfig(), nats, fakeLogger);
  });

  it('should publish a mapped tick for a valid BTC trade update', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('trade.json'))));
    expect(captured).toHaveLength(1);
    const first = captured[0];
    if (first === undefined) {
      expect.fail('expected exactly one captured publish');
    }
    expect(first.subject).toBe(ticksSubject('btc', 'kraken'));
    const tick = TickSchema.parse(first.payload);
    expect(tick).toMatchObject({ asset: 'btc', source: 'kraken', price: 95000.5 });
    expect(tick.sourceTimestamp).toBe(new Date('2026-05-21T18:59:59.987654Z').getTime());
    expect(first.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should publish a mapped tick for a valid ETH trade update', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('trade-eth.json'))));
    expect(captured).toHaveLength(1);
    const first = captured[0];
    if (first === undefined) {
      expect.fail('expected exactly one captured publish');
    }
    expect(first.subject).toBe(ticksSubject('eth', 'kraken'));
    expect(TickSchema.parse(first.payload)).toMatchObject({
      asset: 'eth',
      source: 'kraken',
      price: 2070.25,
    });
  });

  it('should not publish trades from a snapshot frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('trade-snapshot.json'))));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.snapshot.skipped' }),
      expect.any(String),
    );
  });

  it('should not publish for a subscribe acknowledgement', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('subscribe-ack.json'))));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.subscription_confirmed' }),
      expect.any(String),
    );
  });

  it('should not publish for a heartbeat frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('heartbeat.json'))));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.control_frame' }),
      expect.any(String),
    );
  });

  it('should warn ws.frame.schema_invalid and not publish for an unknown channel', () => {
    svc.handleMessage(Buffer.from(JSON.stringify({ channel: 'book', data: [] })));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.frame.schema_invalid' }),
      expect.any(String),
    );
  });

  it('should warn ws.trade.unknown_symbol and not publish for an unknown symbol', () => {
    const frame = readFixture('trade.json') as TradeFrameShape;
    firstTradeFromFrame(frame).symbol = 'XRP/USD';
    svc.handleMessage(Buffer.from(JSON.stringify(frame)));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.trade.unknown_symbol' }),
      expect.any(String),
    );
  });

  it('should warn ws.frame.invalid_json and not publish for malformed JSON', () => {
    svc.handleMessage(Buffer.from('not json'));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.frame.invalid_json' }),
      expect.any(String),
    );
  });
});
