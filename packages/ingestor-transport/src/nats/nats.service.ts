/**
 * @file Shared NATS publisher adapter for the three ingestor apps.
 *
 * This is the only place in the codebase (outside the aggregator's
 * own NATS adapter under `infrastructure/`) that imports the
 * `@nats-io/...` client libraries directly. CLAUDE.md rule 14
 * ("Adapters for external integrations") is the reason: domain code
 * and feature services never touch a client SDK; they hold a typed
 * `NatsService` and call `publishContract` / `publishRaw`.
 *
 * Three responsibilities, in order of importance:
 *
 *  1. **Manage the connection lifecycle.** The class implements
 *     NestJS's `OnModuleInit` / `OnModuleDestroy` hooks so the broker
 *     connection is opened on app boot and drained on shutdown.
 *     Drain (rather than hard close) lets in-flight publishes finish.
 *
 *  2. **Validate-then-publish on the contract.** `publishContract`
 *     accepts a Zod schema together with a payload and refuses to
 *     send if the payload fails validation, with a `warn`-level log
 *     including the Zod issue list. That is what enforces CLAUDE.md
 *     rule 5 ("Validate at boundaries") on the publish side: a buggy
 *     mapper can never put a malformed Tick on the bus.
 *
 *  3. **Propagate the correlation ID.** Every publish attaches the
 *     correlation ID to the NATS message header named
 *     `CORRELATION_HEADER` (see
 *     `packages/contracts/src/subjects.ts`). The aggregator's NATS
 *     subscriber reads that header back out and binds it to its pino
 *     logger for the rest of the tick's lifecycle, which is what
 *     makes "grep one correlation ID across all service logs" work
 *     end-to-end (CLAUDE.md operational quirks → "Correlation IDs
 *     propagate end-to-end").
 *
 * Choice of bus is **NATS Core, not JetStream** — see CLAUDE.md
 * operational quirks and the `decisions.md` entry on NATS Core. Pure
 * pub/sub is enough for the tick → aggregate → SSE pipeline; we get
 * fire-and-forget semantics that match the "lossy, replace with the
 * next tick" model of a price feed. This file's `publish*` methods
 * therefore return `void`, not a promise of acknowledgement; there is
 * no broker-side persistence to wait on.
 *
 * Failure handling is deliberately soft. A failed publish logs at
 * `warn` and returns; the next tick will publish a fresh price.
 * That trade-off matches CLAUDE.md rule 20's mapping of "recoverable
 * boundary failures" to `warn`, and it keeps the ingestor's hot path
 * non-blocking even when the broker is unreachable.
 *
 * NestJS DI note: this service is provided via a factory in each
 * ingestor's `NatsModule` (e.g.
 * `apps/ingestor-binance/src/nats/nats.module.ts`) because the
 * options object is built from app-specific env config. The factory
 * also forwards an explicit `PinoLogger` — CLAUDE.md operational
 * quirks call this out: under `tsx`, decorator metadata is not
 * emitted, so NestJS cannot infer constructor parameter tokens from
 * types alone. The `useFactory` pattern sidesteps that entirely by
 * passing the instance explicitly.
 */
import { headers, type NatsConnection } from '@nats-io/nats-core';
import { connect } from '@nats-io/transport-node';
import { CORRELATION_HEADER } from '@price-oracle/contracts/subjects';

import type { NatsTransportOptions } from './options.js';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';

/**
 * Strip the `user:password@` segment from a NATS URL before it is
 * logged. CLAUDE.md rule 12 forbids logging credentials; the regex
 * targets exactly the `//user:pass@` shape and leaves everything else
 * (scheme, host, port, path) intact.
 *
 * Kept file-local on purpose: this is a logging concern of this
 * adapter, not a generic utility the rest of the codebase should
 * depend on.
 */
function redactUrl(url: string): string {
  return url.replace(/\/\/[^@/]+@/, '//***@');
}

/**
 * NestJS provider that owns the ingestor's NATS connection and
 * exposes a typed publish API.
 *
 * Lifecycle:
 *  - `onModuleInit` connects to the broker. The promise resolves
 *    after the initial TCP/INFO handshake — by the time the rest of
 *    the app starts, `this.connection` is set.
 *  - `onModuleDestroy` drains the connection (lets pending publishes
 *    flush before closing), then clears the field so any late
 *    publish attempt is rejected cleanly via the `if (!connection)`
 *    guard in `publishBytes`.
 *
 * Reconnect: the `@nats-io/transport-node` client reconnects
 * automatically on transient drops. The exponential delay between
 * application-level reconnect attempts (used for the *exchange*
 * WebSocket, not for NATS itself) is computed by `nextDelayMs` in
 * `../backoff.ts`.
 */
export class NatsService implements OnModuleInit, OnModuleDestroy {
  // Single encoder instance per service: TextEncoder is allocation-free
  // to reuse and we encode on every publish.
  private readonly encoder = new TextEncoder();

  // `undefined` until `onModuleInit` resolves, and again after
  // `onModuleDestroy`. The `publishBytes` guard treats that state as
  // "not ready, drop the publish with a warn log" rather than throwing,
  // because the ingestor's hot path must never throw on a transient
  // boot-ordering issue.
  private connection: NatsConnection | undefined;

  /**
   * @param options Per-app transport configuration (see
   *                `NatsTransportOptions`). Built by each ingestor's
   *                `NatsModule` factory from the Zod-parsed env config.
   * @param logger  `PinoLogger` injected explicitly by the factory.
   *                Bound to this class's context (`NatsService`) below
   *                so every log line is automatically scoped.
   */
  constructor(
    private readonly options: NatsTransportOptions,
    private readonly logger: PinoLogger,
  ) {
    // `setContext` makes pino's `context` field equal to the class
    // name; the dashboard and `pino-pretty` use it to group logs by
    // component without each call site repeating the name.
    this.logger.setContext(NatsService.name);
  }

  /**
   * Open the broker connection. Awaited by NestJS during bootstrap,
   * so a connection failure aborts the app rather than letting it
   * start in a degraded state.
   *
   * The URL is logged with credentials redacted (`redactUrl`) — see
   * CLAUDE.md rule 12.
   */
  async onModuleInit(): Promise<void> {
    this.connection = await connect({ servers: this.options.natsUrl });
    this.logger.info(
      { event: 'nats.connect', url: redactUrl(this.options.natsUrl) },
      'NATS connected',
    );
  }

  /**
   * Drain the connection on shutdown so in-flight publishes flush
   * before the socket closes. No-op if init failed or destroy is
   * called twice (idempotent, important for hot-reload in dev).
   */
  async onModuleDestroy(): Promise<void> {
    if (!this.connection) return;
    await this.connection.drain();
    this.connection = undefined;
  }

  /**
   * Validate a payload against a Zod schema and publish it on the
   * given subject if (and only if) validation succeeds.
   *
   * This is the primary publish API for the ingestor mappers — they
   * pass the `TickSchema` together with the parsed exchange message
   * so a regression in the mapper cannot leak a malformed Tick onto
   * the bus. Validation failure is logged at `warn` with the issue
   * list and the message is *dropped*; the next tick will publish
   * fresh data.
   *
   * Why drop rather than throw: the ingestor's WebSocket frame loop
   * is hot and asynchronous, and a thrown error here would propagate
   * up to whatever scheduled the publish, potentially tearing down
   * the loop. Dropping plus a `warn` log matches the system's "lossy
   * by design" stance on individual ticks.
   *
   * @param schema        Zod schema for `payload`. `z.input<S>` is
   *                      used so the caller can pass the parser's
   *                      *input* shape (pre-transform), which matches
   *                      what mappers produce.
   * @param subject       NATS subject to publish on. In practice
   *                      built via `ticksSubject(asset, source)` from
   *                      `@price-oracle/contracts/subjects`.
   * @param payload       Payload to validate and send.
   * @param correlationId Per-tick correlation ID, set at the
   *                      ingestor and propagated end-to-end via the
   *                      `CORRELATION_HEADER`.
   */
  publishContract<S extends z.ZodTypeAny>(
    schema: S,
    subject: string,
    payload: z.input<S>,
    correlationId: string,
  ): void {
    // `safeParse` rather than `parse` because a failed validation is
    // expected behavior here — we log and continue, we don't throw.
    const result = schema.safeParse(payload);
    if (!result.success) {
      this.logger.warn(
        { event: 'nats.publish.invalid', subject, correlationId, issues: result.error.issues },
        'Refusing to publish a payload that failed contract validation',
      );
      return;
    }
    // Serialize the *parsed* (post-transform) data, not the original
    // input. This guarantees the bytes on the wire match the schema
    // and match what the aggregator will re-parse on the other side.
    this.publishBytes(subject, this.encoder.encode(JSON.stringify(result.data)), correlationId);
  }

  /**
   * Publish an arbitrary string body, bypassing schema validation.
   *
   * Reserved for legitimate non-contract payloads — for example, the
   * ingestor-mock's chaos admin path that injects a deliberately
   * **malformed** tick. The mock needs to bypass `publishContract`
   * exactly because its job is to exercise the aggregator's
   * downstream validation; using this method is the documented
   * escape hatch.
   *
   * Production ingestors should not use this method.
   */
  publishRaw(subject: string, body: string, correlationId: string): void {
    this.publishBytes(subject, this.encoder.encode(body), correlationId);
  }

  /**
   * Inner publish that both public methods funnel through. Owns the
   * connection-readiness check, the correlation-ID header, and the
   * exception → `warn` log conversion.
   *
   * Kept private (no JSDoc on the public surface) because callers
   * should pick `publishContract` or `publishRaw` based on whether
   * they have a schema, not call this directly.
   */
  private publishBytes(subject: string, bytes: Uint8Array, correlationId: string): void {
    // Snapshot the field once: the connection could be cleared by
    // `onModuleDestroy` between the check and the `connection.publish`
    // call in a worst-case interleaving. A local binding makes the
    // intent obvious and the check meaningful.
    const connection = this.connection;
    if (!connection) {
      // Not ready: log at `warn` and drop. This is the boot-ordering
      // safety net — the first tick *can* fire before `onModuleInit`
      // resolves on slow CI.
      this.logger.warn(
        { event: 'nats.publish.skipped', subject, correlationId },
        'NATS connection not ready',
      );
      return;
    }

    // Attach the correlation ID via NATS message headers — this is
    // the contract that the aggregator's NATS subscriber relies on
    // (see `CORRELATION_HEADER` in `packages/contracts/src/subjects.ts`).
    // A new `headers()` instance per publish is intentional: the NATS
    // client mutates the structure on send.
    const h = headers();
    h.append(CORRELATION_HEADER, correlationId);
    try {
      connection.publish(subject, bytes, { headers: h });
    } catch (err) {
      // `connection.publish` can throw synchronously (e.g. socket in
      // a failed state). Match the soft-failure stance of the rest of
      // the adapter: `warn`, never let it escape into the hot path.
      this.logger.warn(
        {
          event: 'nats.publish.failed',
          subject,
          correlationId,
          error: err instanceof Error ? err.message : String(err),
        },
        'NATS publish failed',
      );
    }
  }
}
