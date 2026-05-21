import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { type AssetId, type Millis, type Price } from '@price-oracle/contracts/primitives';
import { ticksSubject } from '@price-oracle/contracts/subjects';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';
import { NatsService } from '../nats/nats.service.js';

import { ChaosMode } from './chaos-mode.js';
import { ChaosStateService } from './chaos-state.service.js';
import { nextPrice } from './random-walk.js';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];
const MOCK_SOURCE = 'mock' as const;
const CORRELATION_HEADER = 'x-correlation-id';

export interface LastPublished {
  readonly price: Price;
  readonly sourceTimestamp: Millis;
}

@Injectable()
export class TickGeneratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickGeneratorService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly lastPrice: Record<AssetId, Price>;
  private readonly lastTickAt: Record<AssetId, Millis> = { btc: 0, eth: 0 };

  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(ChaosStateService) private readonly chaos: ChaosStateService,
  ) {
    this.lastPrice = {
      btc: config.MOCK_BTC_ANCHOR_USD,
      eth: config.MOCK_ETH_ANCHOR_USD,
    };
  }

  onModuleInit(): void {
    this.emitAll();
    this.interval = setInterval(() => this.emitAll(), this.config.MOCK_TICK_INTERVAL_MS);
    this.logger.log({
      event: 'lifecycle.start',
      intervalMs: this.config.MOCK_TICK_INTERVAL_MS,
    });
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.logger.log({ event: 'lifecycle.stop' });
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
    const headers = { [CORRELATION_HEADER]: correlationId };
    const subject = ticksSubject(asset, MOCK_SOURCE);

    if (state.mode === ChaosMode.DISCONNECTED) return;

    if (state.mode === ChaosMode.MALFORMED) {
      const body = JSON.stringify({ asset, source: MOCK_SOURCE, price: null, receivedAt: now });
      this.nats.publishRaw(subject, body, { headers });
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
        { headers },
      );
      return;
    }

    const price = nextPrice(this.lastPrice[asset], {
      volatilityPct: this.config.MOCK_PRICE_VOLATILITY_PCT,
      rand: Math.random,
    });
    this.lastPrice[asset] = price;
    this.lastTickAt[asset] = now;
    this.nats.publishContract(
      TickSchema,
      subject,
      { asset, source: MOCK_SOURCE, price, receivedAt: now, sourceTimestamp: now },
      { headers },
    );
  }
}
