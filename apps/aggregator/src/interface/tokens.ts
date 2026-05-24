/**
 * @file Cross-module NestJS DI tokens for the aggregator.
 *
 * **The point.** NestJS DI is type-erased at runtime — providers and
 * consumers must agree on a *value* token, not a type, to bind a
 * dependency. This file declares the symbols for the shared
 * infrastructure singletons that don't have natural class-based
 * tokens: the shared pino logger, the shared NATS connection, the
 * shared Mongo client and `Db`.
 *
 * **Why `Symbol.for(...)`** (rather than `Symbol(...)`). `Symbol.for`
 * goes through a global registry keyed by string, so accidental
 * duplicate-symbol creation across two import paths is impossible.
 * Same pattern as the port tokens in `domain/ports/*.port.ts`.
 *
 * **CLAUDE.md operational quirks: explicit `@Inject` everywhere.**
 * `tsx` (the dev runner) does not emit TypeScript's
 * `design:paramtypes` decorator metadata, so NestJS cannot infer
 * constructor parameter tokens from types alone. Every consumer of
 * these tokens spells the `@Inject(LOGGER)` / `@Inject(NATS_CONNECTION)`
 * etc. explicitly — see `app.module.ts` factories and the
 * controllers' constructors.
 *
 * **Why ports get their own tokens elsewhere.** `AUDIT_PORT`,
 * `DIAGNOSE_PORT`, `PUBLISH_PORT`, `SOURCE_STREAM_PORT` are defined
 * in `domain/ports/*.port.ts` next to the interface they identify —
 * keeping the token next to the contract makes the relationship
 * obvious. The tokens in this file are infrastructure singletons
 * that have no port-style contract, so they live with the
 * composition root instead.
 *
 * Cross-references:
 *  - `app.module.ts`: where every token below is provided and the
 *    factories that consume them.
 *  - CLAUDE.md operational quirks → "NestJS DI under `tsx` needs
 *    explicit `@Inject()` on every constructor parameter."
 */

/**
 * Shared pino `Logger` instance. Constructed once at the top of
 * `app.module.ts` with the service-level `base: { service: 'aggregator' }`
 * binding so every log line carries the service field automatically.
 */
export const LOGGER = Symbol.for('@price-oracle/aggregator/logger');

/**
 * Shared `NatsConnection`. Used by both `NatsPublisher` (out) and
 * `NatsSourceStream` (in) so the aggregator holds exactly one
 * connection to the broker. Drained by `lifecycle.service.ts` on
 * `onApplicationShutdown`.
 */
export const NATS_CONNECTION = Symbol.for('@price-oracle/aggregator/nats-connection');

/**
 * Shared `MongoClient`. Lifecycle managed by the DI factory + the
 * `LifecycleService.onApplicationShutdown` hook that calls
 * `mongo.close()` cleanly.
 */
export const MONGO_CLIENT = Symbol.for('@price-oracle/aggregator/mongo-client');

/**
 * Derived `Db` handle (`client.db()`). Provided via a one-line
 * factory in `app.module.ts` so the `MongoAudit` adapter does not
 * need to know about the client lifecycle — it depends on a `Db`,
 * which is the smallest surface it actually uses.
 */
export const MONGO_DB = Symbol.for('@price-oracle/aggregator/mongo-db');
