/**
 * @file Bootstrap and graceful-shutdown service for the aggregator.
 *
 * **The "wire it together at boot, tear it down on shutdown" glue.**
 * NestJS calls `onApplicationBootstrap` once every provider has
 * resolved and the HTTP server is listening; it calls
 * `onApplicationShutdown` on SIGTERM / SIGINT (forwarded by
 * `main.ts`). This service uses both hooks to:
 *
 *  - **On bootstrap**: start the orchestrator. Three things happen
 *    inside `Orchestrator.start()`:
 *      1. `AuditPort.lastKnownAggregate(asset)` runs per asset to
 *         restore `runtime.lastAggregate` so the snapshot endpoint
 *         returns a value immediately. CLAUDE.md operational quirks:
 *         "Aggregator restart recovers `lastKnownAggregate` per
 *         asset from `AuditPort` and serves it via `/api/snapshot`
 *         until the first new tick arrives."
 *      2. NATS subscription opens on `ticks.>`.
 *      3. 500ms pulse timer starts.
 *
 *  - **On shutdown**: tear down in reverse order — orchestrator
 *    first (so no more ticks/pulses are processed), then Mongo
 *    (`close()`), then NATS (`drain()`). Drain (not hard close)
 *    lets the publisher's last few aggregates flush even if the
 *    pulse loop just emitted them.
 *
 * **Why the explicit `@Inject(...)` on every parameter.** CLAUDE.md
 * operational quirks: `tsx` does not emit decorator metadata, so
 * NestJS cannot infer the constructor's tokens from types. Every
 * one of these `@Inject`s is required — omit one and the field
 * resolves to `undefined`, which manifests as
 * `Cannot read properties of undefined (reading 'start')` inside
 * `onApplicationBootstrap`.
 *
 * **Two `Inject` styles in one constructor on purpose.**
 *  - `@Inject(Orchestrator)`: class-based token. The class itself
 *    is the DI key.
 *  - `@Inject(NATS_CONNECTION)` / `@Inject(MONGO_CLIENT)` /
 *    `@Inject(LOGGER)`: symbol-based tokens from `tokens.ts` because
 *    the providers are not classes (raw connection / client / pino
 *    instance).
 *
 * Both styles still need `@Inject` under `tsx` — the operational
 * quirk applies uniformly.
 *
 * **Why no try/catch around the teardown calls.** Shutdown is
 * already in the "process is exiting" path; an exception here would
 * be caught by `main.ts::bootstrap.failed` or by NestJS's own
 * shutdown plumbing. Adding a try/catch would hide a genuinely
 * broken teardown without giving us anything actionable.
 *
 * Cross-references:
 *  - `app.module.ts`: provides every token consumed here.
 *  - `application/orchestrator.ts::start / stop`: the two methods
 *    this service drives.
 *  - `main.ts`: forwards SIGTERM/SIGINT into `app.close()` which
 *    triggers `onApplicationShutdown`.
 */
import { Inject, Injectable } from '@nestjs/common';

import { Orchestrator } from '../application/orchestrator.js';

import { MONGO_CLIENT, NATS_CONNECTION, LOGGER } from './tokens.js';

import type { NatsConnection } from '@nats-io/nats-core';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { MongoClient } from 'mongodb';
import type { Logger } from 'pino';

@Injectable()
export class LifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(Orchestrator) private readonly orchestrator: Orchestrator,
    @Inject(NATS_CONNECTION) private readonly nats: NatsConnection,
    @Inject(MONGO_CLIENT) private readonly mongo: MongoClient,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Bootstrap hook. The HTTP server is already listening when this
   * fires, but the orchestrator is not running yet — that is the
   * intent. We delay tick processing until every controller is up
   * so the dashboard's first poll lands on a valid `/api/snapshot`
   * response.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.orchestrator.start();
  }

  /**
   * Shutdown hook. Order matters:
   *  1. Stop the orchestrator — cancels the pulse timer and
   *     unsubscribes from NATS. After this, no more publishes will
   *     be issued.
   *  2. Close Mongo — flushes any in-flight write.
   *  3. Drain NATS — lets the publisher's last few messages flush
   *     before the socket closes. `drain` (not `close`) is the
   *     graceful variant.
   */
  async onApplicationShutdown(): Promise<void> {
    this.orchestrator.stop();
    await this.mongo.close();
    await this.nats.drain();
    this.logger.info({ event: 'aggregator.shutdown' }, 'Aggregator shut down');
  }
}
