/**
 * @file NestJS module that owns the Coinbase WebSocket adapter.
 *
 * Single-provider module: it exposes `CoinbaseService` (the WebSocket
 * lifecycle + subscribe handshake + frame discrimination + per-trade
 * publish loop) and pulls in `NatsModule` so the service can inject
 * `NatsService` for the publish side.
 *
 * This is the "thin Nest module" shape called out in CLAUDE.md
 * ("Backend: hexagonal hybrid") and in the `decisions.md` entry on
 * Hexagonal Hybrid that specifically names "Coinbase channel matrix"
 * as the kind of vendor protocol detail that *gets harder* to read
 * under ports/adapters layering. Ingestors have no domain logic — they
 * are protocol adapters that translate between an exchange's wire
 * format and the shared `Tick` contract — so the file layout here is
 * shallow on purpose: an outer-frame schema, a market-trades data
 * schema, an error-frame schema, a symbol map, a subscribe-message
 * builder, the source-id constant, the service, and the NestJS
 * scaffolding to wire them.
 *
 * Notice this app has *more* files than `apps/ingestor-binance/`. That
 * is not architectural drift; it reflects Coinbase's multi-channel
 * subscribe protocol — the client must explicitly send a `subscribe`
 * frame after connect (see `subscribe.ts`), and frames arrive as a
 * discriminated union of data channels, subscription confirmations,
 * and error envelopes (see `frame.schema.ts` and `error-frame.schema.ts`).
 * Binance, by contrast, encodes its subscription set in the URL and
 * only delivers one frame type, so its trade-event schema is a single
 * file.
 *
 * If you find yourself wanting to add a `domain/` directory here,
 * stop and reread the `decisions.md` entry on the hexagonal hybrid:
 * the rule is that domain layout follows domain reasoning, and an
 * ingestor has none of its own.
 */
import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { CoinbaseService } from './coinbase.service.js';

@Module({
  imports: [NatsModule],
  providers: [CoinbaseService],
})
export class CoinbaseModule {}
