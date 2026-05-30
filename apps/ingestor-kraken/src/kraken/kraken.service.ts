import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { nextDelayMs } from '@price-oracle/ingestor-transport/backoff';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';
import WebSocket, { type RawData } from 'ws';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

import { ControlChannelFrameSchema, MethodAckSchema } from './control-frame.schema.js';
import { assetFromKrakenSymbol } from './kraken-symbols.js';
import { KRAKEN_SOURCE } from './source.js';
import { TRADE_SUBSCRIBE } from './subscribe.js';
import { KrakenTradeSchema, TradeFrameSchema } from './trade.schema.js';

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
export class KrakenService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | undefined;
  private attempt = 0;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(KrakenService.name);
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
      { event: 'ws.connecting', sourceId: KRAKEN_SOURCE, url: this.config.krakenWsUrl },
      'Connecting to Kraken WS',
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.config.krakenWsUrl);
    } catch (err) {
      this.logger.warn(
        {
          event: 'ws.construct.failed',
          sourceId: KRAKEN_SOURCE,
          error: err instanceof Error ? err.message : String(err),
        },
        'Kraken WS construct failed',
      );
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.attempt = 0;
      ws.send(JSON.stringify(TRADE_SUBSCRIBE));
      this.logger.info(
        { event: 'ws.open', sourceId: KRAKEN_SOURCE },
        'Kraken WS connected and subscribed to trade',
      );
    });

    ws.on('message', (raw) => this.handleMessage(raw));

    ws.on('close', () => {
      if (this.isShuttingDown) return;
      this.logger.info(
        { event: 'ws.close', sourceId: KRAKEN_SOURCE },
        'Kraken WS closed; scheduling reconnect',
      );
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      this.logger.warn(
        { event: 'ws.error', sourceId: KRAKEN_SOURCE, error: err.message },
        'Kraken WS error',
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
        sourceId: KRAKEN_SOURCE,
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
          sourceId: KRAKEN_SOURCE,
          payload: truncate(text),
          error: err instanceof Error ? err.message : String(err),
        },
        'Kraken frame is not valid JSON',
      );
      return;
    }

    const ack = MethodAckSchema.safeParse(parsed);
    if (ack.success) {
      if (ack.data.success) {
        this.logger.debug(
          { event: 'ws.subscription_confirmed', sourceId: KRAKEN_SOURCE },
          'Subscription confirmed',
        );
      } else {
        this.logger.warn(
          { event: 'ws.subscribe.failed', sourceId: KRAKEN_SOURCE, payload: truncate(text) },
          'Kraken subscribe failed',
        );
      }
      return;
    }

    const control = ControlChannelFrameSchema.safeParse(parsed);
    if (control.success) {
      this.logger.debug(
        { event: 'ws.control_frame', sourceId: KRAKEN_SOURCE, channel: control.data.channel },
        'Ignoring Kraken control frame',
      );
      return;
    }

    const result = TradeFrameSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'ws.frame.schema_invalid',
          sourceId: KRAKEN_SOURCE,
          payload: truncate(text),
          issues: result.error.issues,
        },
        'Kraken frame failed schema validation',
      );
      return;
    }

    if (result.data.type !== 'update') {
      this.logger.debug(
        { event: 'ws.snapshot.skipped', sourceId: KRAKEN_SOURCE, count: result.data.data.length },
        'Ignoring Kraken trade snapshot',
      );
      return;
    }

    for (const rawTrade of result.data.data) {
      this.publishTrade(rawTrade);
    }
  }

  private publishTrade(rawTrade: unknown): void {
    const correlationId = randomUUID();
    const result = KrakenTradeSchema.safeParse(rawTrade);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'ws.trade.invalid',
          sourceId: KRAKEN_SOURCE,
          correlationId,
          issues: result.error.issues,
        },
        'Kraken trade failed schema validation',
      );
      return;
    }
    const trade = result.data;
    const asset = assetFromKrakenSymbol(trade.symbol);
    if (!asset) {
      this.logger.warn(
        {
          event: 'ws.trade.unknown_symbol',
          sourceId: KRAKEN_SOURCE,
          correlationId,
          symbol: trade.symbol,
        },
        'Kraken trade carries an unknown symbol',
      );
      return;
    }

    const tick = {
      asset,
      source: KRAKEN_SOURCE,
      price: trade.price,
      receivedAt: Date.now(),
      sourceTimestamp: new Date(trade.timestamp).getTime(),
    };

    this.nats.publishContract(TickSchema, ticksSubject(asset, KRAKEN_SOURCE), tick, correlationId);
  }
}
