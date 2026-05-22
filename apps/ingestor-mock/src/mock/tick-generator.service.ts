import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { type AssetId, type Millis, type Price } from '@price-oracle/contracts/primitives';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

import { ChaosMode } from './chaos-mode.js';
import { ChaosStateService } from './chaos-state.service.js';
import { nextPrice } from './random-walk.js';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];
const MOCK_SOURCE = 'mock' as const;

export interface LastPublished {
  readonly price: Price;
  readonly sourceTimestamp: Millis;
}

@Injectable()
export class TickGeneratorService implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;
  private readonly lastPrice: Record<AssetId, Price>;
  private readonly lastTickAt: Record<AssetId, Millis> = { btc: 0, eth: 0 };

  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(ChaosStateService) private readonly chaos: ChaosStateService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TickGeneratorService.name);
    this.lastPrice = {
      btc: config.btcAnchorUsd,
      eth: config.ethAnchorUsd,
    };
  }

  onModuleInit(): void {
    this.emitAll();
    this.interval = setInterval(() => this.emitAll(), this.config.tickIntervalMs);
    this.logger.info(
      { event: 'lifecycle.start', intervalMs: this.config.tickIntervalMs },
      'Tick generator started',
    );
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.logger.info({ event: 'lifecycle.stop' }, 'Tick generator stopped');
  }

  lastPublished(asset: AssetId): LastPublished | null {
    if (this.lastTickAt[asset] === 0) return null;
    return { price: this.lastPrice[asset], sourceTimestamp: this.lastTickAt[asset] };
  }

  private emitAll(): void {
    const now = Date.now();
    for (const asset of ASSETS) this.emitOne(asset, now);
  }

  private emitOne(asset: AssetId, now: Millis): void {
    const state = this.chaos.get(asset);
    const correlationId = randomUUID();
    const subject = ticksSubject(asset, MOCK_SOURCE);

    if (state.mode === ChaosMode.DISCONNECTED) return;

    if (state.mode === ChaosMode.MALFORMED) {
      const body = JSON.stringify({ asset, source: MOCK_SOURCE, price: null, receivedAt: now });
      this.nats.publishRaw(subject, body, correlationId);
      return;
    }

    if (state.mode === ChaosMode.STALE) {
      this.nats.publishContract(
        TickSchema,
        subject,
        {
          asset,
          source: MOCK_SOURCE,
          price: state.frozenPrice,
          receivedAt: now,
          sourceTimestamp: state.frozenSourceTimestamp,
        },
        correlationId,
      );
      return;
    }

    const price = nextPrice(this.lastPrice[asset], {
      volatilityPct: this.config.priceVolatilityPct,
      rand: Math.random,
    });
    this.lastPrice[asset] = price;
    this.lastTickAt[asset] = now;
    this.nats.publishContract(
      TickSchema,
      subject,
      { asset, source: MOCK_SOURCE, price, receivedAt: now, sourceTimestamp: now },
      correlationId,
    );
  }
}
