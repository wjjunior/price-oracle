/**
 * @file NestJS module that wires the shared `NatsService` adapter
 * (from `@price-oracle/ingestor-transport/nats`) into the mock's DI
 * container.
 *
 * **Identical to the Binance/Coinbase nats modules.** Compare
 * `apps/ingestor-binance/src/nats/nats.module.ts` — the body is the
 * same. The shared transport package owns the NATS publish semantics
 * (correlation-ID header propagation, schema re-validation in
 * `publishContract`, raw-bytes path in `publishRaw`), so each
 * ingestor only has to wire it into its own DI container with its
 * own config.
 *
 * **Factory provider, not `useClass`.** The `NatsService` constructor
 * needs:
 *
 *  1. A `NatsTransportOptions` object — built inline from
 *     `IngestorConfig.natsUrl`. The options type leaves room to add
 *     `name`, `token`, etc. later without a constructor change.
 *  2. An explicit `PinoLogger` instance — forwarded via
 *     `inject: [PinoLogger]` because `NatsService` is a plain TS
 *     class (not `@Injectable()`) so that the transport package can
 *     be used from any host.
 *
 * The `useFactory` + `inject` pattern is also the documented
 * workaround for the `tsx` decorator-metadata limitation (CLAUDE.md
 * operational quirks: "NestJS DI under `tsx` needs explicit
 * `@Inject()` on every constructor parameter") — factory injection
 * is name-driven rather than reflection-driven, so it works
 * regardless of whether `design:paramtypes` is emitted.
 *
 * **What the tick generator does with `NatsService`.** Two methods:
 *  - `publishContract(TickSchema, subject, tick, correlationId)` for
 *    healthy and stale ticks (the schema parse on the way out is
 *    defense in depth — the aggregator parses it again on the way
 *    in).
 *  - `publishRaw(subject, body, correlationId)` for the MALFORMED
 *    chaos mode, where the whole point is to ship a payload that
 *    fails the contract. `publishContract` would reject our own
 *    invalid payload on this side; `publishRaw` bypasses that check
 *    so the bad bytes can actually reach the aggregator's NATS
 *    subscriber for the demo. See `mock/tick-generator.service.ts`.
 */
import { Module } from '@nestjs/common';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

@Module({
  providers: [
    {
      provide: NatsService,
      useFactory: (config: IngestorConfig, logger: PinoLogger): NatsService =>
        new NatsService({ natsUrl: config.natsUrl }, logger),
      inject: [INGESTOR_CONFIG, PinoLogger],
    },
  ],
  exports: [NatsService],
})
export class NatsModule {}
