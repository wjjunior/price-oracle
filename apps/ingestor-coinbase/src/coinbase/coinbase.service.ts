import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { PinoLogger } from 'nestjs-pino';
import WebSocket, { type RawData } from 'ws';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';
import { NatsService } from '../nats/nats.service.js';

import { nextDelayMs } from './backoff.js';
import { assetFromCoinbaseProductId } from './coinbase-symbols.js';
import { ErrorFrameSchema } from './error-frame.schema.js';
import { FrameSchema } from './frame.schema.js';
import { TradeSchema } from './market-trades.schema.js';
import { COINBASE_SOURCE } from './source.js';
import { MARKET_TRADES_SUBSCRIBE } from './subscribe.js';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

const PAYLOAD_TRUNCATE_LENGTH = 256;

function utf8FromRawData(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return Buffer.concat(raw).toString('utf8');
}

function truncate(s: string): string {
  return s.length <= PAYLOAD_TRUNCATE_LENGTH ? s : `${s.slice(0, PAYLOAD_TRUNCATE_LENGTH)}…`;
}

@Injectable()
export class CoinbaseService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | undefined;
  private attempt = 0;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CoinbaseService.name);
  }

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.removeAllListeners();
    this.ws?.terminate();
    this.ws = undefined;
  }

  private connect(): void {
    if (this.isShuttingDown) return;
    this.logger.info(
      { event: 'ws.connecting', sourceId: COINBASE_SOURCE, url: this.config.coinbaseWsUrl },
      'Connecting to Coinbase WS',
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.config.coinbaseWsUrl);
    } catch (err) {
      this.logger.warn(
        {
          event: 'ws.construct.failed',
          sourceId: COINBASE_SOURCE,
          error: err instanceof Error ? err.message : String(err),
        },
        'Coinbase WS construct failed',
      );
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.attempt = 0;
      ws.send(JSON.stringify(MARKET_TRADES_SUBSCRIBE));
      this.logger.info(
        { event: 'ws.open', sourceId: COINBASE_SOURCE },
        'Coinbase WS connected and subscribed to market_trades',
      );
    });

    ws.on('message', (raw) => this.handleMessage(raw));

    ws.on('close', () => {
      if (this.isShuttingDown) return;
      this.logger.info(
        { event: 'ws.close', sourceId: COINBASE_SOURCE },
        'Coinbase WS closed; scheduling reconnect',
      );
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      this.logger.warn(
        { event: 'ws.error', sourceId: COINBASE_SOURCE, error: err.message },
        'Coinbase WS error',
      );
      if (this.isShuttingDown) return;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = undefined;
    }
    this.attempt += 1;
    const delay = nextDelayMs(this.attempt - 1);
    this.logger.info(
      {
        event: 'ws.reconnect.scheduled',
        sourceId: COINBASE_SOURCE,
        attempt: this.attempt,
        delayMs: Math.round(delay),
      },
      'Reconnecting',
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  handleMessage(raw: RawData): void {
    const text = utf8FromRawData(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      this.logger.warn(
        {
          event: 'ws.frame.invalid_json',
          sourceId: COINBASE_SOURCE,
          payload: truncate(text),
          error: err instanceof Error ? err.message : String(err),
        },
        'Coinbase frame is not valid JSON',
      );
      return;
    }

    const errorFrame = ErrorFrameSchema.safeParse(parsed);
    if (errorFrame.success) {
      const first = errorFrame.data.errors[0];
      this.logger.warn(
        {
          event: 'ws.error_frame',
          sourceId: COINBASE_SOURCE,
          errorId: first.id,
          message: first.message,
        },
        'Coinbase error frame',
      );
      return;
    }

    const result = FrameSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'ws.frame.schema_invalid',
          sourceId: COINBASE_SOURCE,
          payload: truncate(text),
          issues: result.error.issues,
        },
        'Coinbase frame failed schema validation',
      );
      return;
    }

    const frame = result.data;
    if (frame.channel === 'subscriptions') {
      this.logger.debug(
        { event: 'ws.subscription_confirmed', sourceId: COINBASE_SOURCE },
        'Subscription confirmed',
      );
      return;
    }

    for (const event of frame.events) {
      if (event.type !== 'update') continue;
      for (const rawTrade of event.trades) {
        this.publishTrade(rawTrade);
      }
    }
  }

  private publishTrade(rawTrade: unknown): void {
    const correlationId = randomUUID();
    const result = TradeSchema.safeParse(rawTrade);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'ws.trade.invalid',
          sourceId: COINBASE_SOURCE,
          correlationId,
          issues: result.error.issues,
        },
        'Coinbase trade failed schema validation',
      );
      return;
    }
    const trade = result.data;
    const asset = assetFromCoinbaseProductId(trade.product_id);
    if (!asset) {
      this.logger.warn(
        {
          event: 'ws.trade.unknown_product',
          sourceId: COINBASE_SOURCE,
          correlationId,
          productId: trade.product_id,
        },
        'Coinbase trade carries an unknown product_id',
      );
      return;
    }

    const tick = {
      asset,
      source: COINBASE_SOURCE,
      price: Number(trade.price),
      receivedAt: Date.now(),
      sourceTimestamp: new Date(trade.time).getTime(),
    };

    this.nats.publishContract(TickSchema, ticksSubject(asset, COINBASE_SOURCE), tick, correlationId);
  }
}
