import { readFileSync } from 'node:fs';

import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type IngestorConfig } from '../config/env.schema.js';
import { type NatsService } from '../nats/nats.service.js';

import { assetFromCoinbaseProductId } from './coinbase-symbols.js';
import { CoinbaseService } from './coinbase.service.js';
import { ErrorFrameSchema } from './error-frame.schema.js';
import { FrameSchema } from './frame.schema.js';
import { TradeSchema } from './market-trades.schema.js';

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
  coinbaseWsUrl: 'wss://advanced-trade-ws.coinbase.com',
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

describe('FrameSchema', () => {
  it('should parse a market_trades frame', () => {
    expect(FrameSchema.safeParse(readFixture('market-trades.json')).success).toBe(true);
  });

  it('should parse a subscriptions frame', () => {
    expect(FrameSchema.safeParse(readFixture('subscriptions.json')).success).toBe(true);
  });
});

describe('TradeSchema', () => {
  const tradeFixture = (): Record<string, unknown> => {
    const frame = readFixture('market-trades.json') as {
      events: { trades: Record<string, unknown>[] }[];
    };
    return frame.events[0]!.trades[0]!;
  };

  it('should reject a trade missing price', () => {
    const trade = tradeFixture();
    delete trade.price;
    expect(TradeSchema.safeParse(trade).success).toBe(false);
  });

  it('should reject a trade with an invalid side', () => {
    const trade = tradeFixture();
    trade.side = 'HOLD';
    expect(TradeSchema.safeParse(trade).success).toBe(false);
  });
});

describe('ErrorFrameSchema', () => {
  it('should parse an error frame', () => {
    expect(ErrorFrameSchema.safeParse(readFixture('error-frame.json')).success).toBe(true);
  });
});

describe('assetFromCoinbaseProductId', () => {
  it('should map a known product id to its asset', () => {
    expect(assetFromCoinbaseProductId('BTC-USD')).toBe('btc');
  });

  it('should return undefined for an unknown product id', () => {
    expect(assetFromCoinbaseProductId('XRP-USD')).toBeUndefined();
  });
});

describe('CoinbaseService.handleMessage', () => {
  let nats: NatsService;
  let captured: Captured[];
  let svc: CoinbaseService;

  beforeEach(() => {
    const built = buildFakeNats();
    nats = built.fake;
    captured = built.captured;
    svc = new CoinbaseService(buildConfig(), nats, fakeLogger);
  });

  it('should publish a mapped tick for a valid market_trades update frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('market-trades.json'))));
    expect(captured).toHaveLength(1);
    const first = captured[0]!;
    expect(first.subject).toBe(ticksSubject('btc', 'coinbase'));
    const tick = TickSchema.parse(first.payload);
    expect(tick).toMatchObject({ asset: 'btc', source: 'coinbase', price: 95000.5 });
    expect(tick.sourceTimestamp).toBe(new Date('2026-05-21T18:59:59.987654Z').getTime());
    expect(first.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should warn ws.error_frame and not publish for an error frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('error-frame.json'))));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.error_frame' }),
      expect.any(String),
    );
  });

  it('should warn ws.frame.schema_invalid and not publish for an unknown channel', () => {
    svc.handleMessage(Buffer.from(JSON.stringify({ channel: 'heartbeats', events: [] })));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.frame.schema_invalid' }),
      expect.any(String),
    );
  });

  it('should warn ws.trade.unknown_product and not publish for an unknown product', () => {
    const frame = readFixture('market-trades.json') as {
      events: { trades: Record<string, unknown>[] }[];
    };
    frame.events[0]!.trades[0]!.product_id = 'XRP-USD';
    svc.handleMessage(Buffer.from(JSON.stringify(frame)));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.trade.unknown_product' }),
      expect.any(String),
    );
  });

  it('should not publish for a subscriptions frame', () => {
    svc.handleMessage(Buffer.from(JSON.stringify(readFixture('subscriptions.json'))));
    expect(captured).toHaveLength(0);
    expect(fakeLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ws.subscription_confirmed' }),
      expect.any(String),
    );
  });
});
