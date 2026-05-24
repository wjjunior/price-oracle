/**
 * @file Construction-time options for {@link NatsService}.
 *
 * Deliberately a single-field record today. The reason it is a separate
 * file (and not, say, a positional `string` argument on the constructor)
 * is forward-compat: if we later need to tune ping intervals, max
 * reconnect attempts, TLS material, or a name advertised to the broker,
 * those settings join this type without touching every call site or
 * NestJS provider factory.
 *
 * Each ingestor app wires this from its own Zod-parsed env config —
 * see `apps/ingestor-binance/src/nats/nats.module.ts` and the
 * equivalents under `apps/ingestor-coinbase/` and `apps/ingestor-mock/`.
 * Following CLAUDE.md rule 11, `process.env` is read once per app in
 * its `config/env.schema.ts`; everything downstream (including this
 * options object) consumes the typed result.
 */

/**
 * Minimal set of inputs needed to open a NATS connection from an
 * ingestor process.
 *
 *  - `natsUrl`: full broker URL (e.g. `nats://localhost:4222` in the
 *               docker-compose stack, `nats://user:pass@host:4222` if
 *               authentication is configured). The service redacts the
 *               credentials portion before logging (see `redactUrl` in
 *               `nats.service.ts`) so secrets don't end up in pino
 *               output — CLAUDE.md rule 12.
 *
 * Marked `readonly` because nothing should mutate the options after
 * construction; the type system enforces this rather than relying on
 * convention.
 */
export type NatsTransportOptions = {
  readonly natsUrl: string;
};
