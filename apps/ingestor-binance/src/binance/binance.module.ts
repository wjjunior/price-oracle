/**
 * @file NestJS module that owns the Binance WebSocket adapter.
 *
 * Single-provider module: it exposes `BinanceService` (the
 * WebSocket lifecycle + parse + publish loop) and pulls in
 * `NatsModule` so the service can inject `NatsService` for the
 * publish side.
 *
 * This is the "thin Nest module" shape called out in CLAUDE.md
 * ("Backend: hexagonal hybrid"). Ingestors have no domain logic —
 * they are protocol adapters that translate between an exchange's
 * wire format and the shared `Tick` contract — so the file layout
 * is shallow on purpose: a schema, a symbol map, a service, and the
 * NestJS scaffolding to wire them.
 *
 * If you find yourself wanting to add a `domain/` directory here,
 * stop and reread the `decisions.md` entry on the hexagonal hybrid:
 * the rule is that domain layout follows domain reasoning, and an
 * ingestor has none of its own.
 *
 * The sibling `apps/ingestor-coinbase/src/coinbase/coinbase.module.ts`
 * has the same shape.
 */
import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { BinanceService } from './binance.service.js';

@Module({
  imports: [NatsModule],
  providers: [BinanceService],
})
export class BinanceModule {}
