import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { PinoLogger } from 'nestjs-pino';
import WebSocket, { type RawData } from 'ws';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';
import { NatsService } from '../nats/nats.service.js';

import { nextDelayMs } from './backoff.js';
import { assetFromBinanceSymbol } from './binance-symbols.js';
import { BinanceCombinedTradeEnvelopeSchema } from './trade-event.schema.js';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { SourceId } from '@price-oracle/contracts/primitives';

const BINANCE_SOURCE: SourceId = 'binance';
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
export class BinanceService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | undefined;
  private attempt = 0;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BinanceService.name);
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
      { event: 'ws.connecting', sourceId: BINANCE_SOURCE, url: this.config.binanceWsUrl },
      'Connecting to Binance WS',
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.config.binanceWsUrl);
    } catch (err) {
      this.logger.warn(
        {
          event: 'ws.construct.failed',
          sourceId: BINANCE_SOURCE,
          error: err instanceof Error ? err.message : String(err),
        },
        'Binance WS construct failed',
      );
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.attempt = 0;
      this.logger.info({ event: 'ws.open', sourceId: BINANCE_SOURCE }, 'Binance WS connected');
    });

    ws.on('message', (raw) => this.handleMessage(raw));

    ws.on('close', () => {
      if (this.isShuttingDown) return;
      this.logger.info(
        { event: 'ws.close', sourceId: BINANCE_SOURCE },
        'Binance WS closed; scheduling reconnect',
      );
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      this.logger.warn(
        { event: 'ws.error', sourceId: BINANCE_SOURCE, error: err.message },
        'Binance WS error',
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
        sourceId: BINANCE_SOURCE,
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
    const correlationId = randomUUID();
    const text = utf8FromRawData(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      this.logger.warn(
        {
          event: 'ws.frame.invalid_json',
          sourceId: BINANCE_SOURCE,
          correlationId,
          payload: truncate(text),
          error: err instanceof Error ? err.message : String(err),
        },
        'Binance frame is not valid JSON',
      );
      return;
    }

    const result = BinanceCombinedTradeEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'ws.frame.schema_invalid',
          sourceId: BINANCE_SOURCE,
          correlationId,
          payload: truncate(text),
          issues: result.error.issues,
        },
        'Binance frame failed schema validation',
      );
      return;
    }

    const { data } = result.data;
    const asset = assetFromBinanceSymbol(data.s);
    if (!asset) {
      this.logger.warn(
        {
          event: 'ws.frame.unknown_symbol',
          sourceId: BINANCE_SOURCE,
          correlationId,
          symbol: data.s,
        },
        'Binance frame carries an unknown symbol',
      );
      return;
    }

    const tick = {
      asset,
      source: BINANCE_SOURCE,
      price: Number(data.p),
      receivedAt: Date.now(),
      sourceTimestamp: data.T,
    };

    this.nats.publishContract(TickSchema, ticksSubject(asset, BINANCE_SOURCE), tick, correlationId);
  }
}
