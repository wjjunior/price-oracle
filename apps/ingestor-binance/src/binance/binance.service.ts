/**
 * @file The Binance WebSocket adapter — the heart of this ingestor.
 *
 * Responsibilities, in the order they occur on the data path:
 *
 *  1. **Maintain a long-lived WebSocket connection** to Binance's
 *     combined trade stream
 *     (`wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade`,
 *     see `DEFAULT_BINANCE_WS_URL` in `../config/env.schema.ts`).
 *     Reconnect uses exponential backoff with jitter from
 *     `@price-oracle/ingestor-transport/backoff` — see that file's
 *     header for the shape of the curve and why jitter matters.
 *
 *  2. **Decode and validate each frame** with the Zod schema in
 *     `./trade-event.schema.ts`. CLAUDE.md rule 5: every external
 *     input passes a parse before becoming a TypeScript type. Bad
 *     JSON, schema-invalid bodies, and unknown symbols are all
 *     logged at `warn` (CLAUDE.md rule 20 — "recoverable boundary
 *     failures") and the frame is dropped.
 *
 *  3. **Build a contract `Tick`** by combining the parsed trade
 *     event with `Date.now()` for `receivedAt` and the symbol
 *     reverse-map for `asset`. The `Tick` shape itself lives in
 *     `@price-oracle/contracts/events`.
 *
 *  4. **Publish on NATS** via the shared `NatsService` adapter
 *     (`@price-oracle/ingestor-transport/nats`), which re-validates
 *     against `TickSchema` and attaches the `correlationId` to the
 *     NATS message header. That correlation ID is generated *per
 *     frame* here (via `randomUUID()`), then flows end-to-end:
 *     ingestor pino logs → NATS header → aggregator pino logs → SSE
 *     envelope → dashboard audit timeline (CLAUDE.md operational
 *     quirks → "Correlation IDs propagate end-to-end").
 *
 * What this service does **not** do — and on purpose:
 *
 *  - **No admin / chaos surface.** Real ingestors are
 *    observation-only; only the mock has `/admin/:asset/...` chaos
 *    endpoints (CLAUDE.md operational quirks → "Mock ingestor admin
 *    API is dev-only"). Binance failures are observed in the field
 *    (rate limits, malformed payloads, drops), never injected
 *    synthetically.
 *  - **No domain logic.** No source health, no breaker state, no
 *    aggregation. Those live in `apps/aggregator/src/domain/`. This
 *    file's job is to translate Binance's wire format into the
 *    shared `Tick` contract and put it on the bus; everything else
 *    is downstream.
 *
 * The sibling `apps/ingestor-coinbase/src/coinbase/coinbase.service.ts`
 * follows an identical shape — exchange-specific schema, same
 * connect / parse / publish loop, same reconnect backoff.
 */
import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { nextDelayMs } from '@price-oracle/ingestor-transport/backoff';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';
import WebSocket, { type RawData } from 'ws';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

import { assetFromBinanceSymbol } from './binance-symbols.js';
import { BinanceCombinedTradeEnvelopeSchema } from './trade-event.schema.js';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { SourceId } from '@price-oracle/contracts/primitives';

// Constant for the source dimension on every published Tick. Typed as
// `SourceId` so a typo would fail compilation against the closed
// `SourceId` enum in `@price-oracle/contracts/primitives` — CLAUDE.md
// rule 3 ("no hardcoded strings for status, roles, events, or types").
const BINANCE_SOURCE: SourceId = 'binance';

// Cap on how many characters of a malformed/invalid frame we include
// in a `warn` log. The point of the log is reproduction, not
// archival, and pino lines get expensive past a few KB. Truncation
// preserves the head of the payload (where the offending field
// usually is) and appends `…` so the operator can tell at a glance
// the line was clipped.
const PAYLOAD_TRUNCATE_LENGTH = 256;

/**
 * Coerce whatever the `ws` library gives us on a `message` event
 * into a UTF-8 string. `ws` types the payload as `RawData`, a union
 * of `string | Buffer | ArrayBuffer | Buffer[]` — each variant comes
 * from a different code path (text vs binary frame, single vs
 * fragmented frame) and we collapse them all here so the JSON parse
 * downstream only deals with strings.
 *
 * The `Buffer.concat` branch handles fragmented frames (a single
 * logical message split across multiple TCP reads); `ws` delivers
 * those as an array of `Buffer`s.
 */
function utf8FromRawData(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return Buffer.concat(raw).toString('utf8');
}

/**
 * Cap log payloads at `PAYLOAD_TRUNCATE_LENGTH` chars and mark
 * truncation with a trailing ellipsis. See the constant's comment
 * for why we truncate at all.
 */
function truncate(s: string): string {
  return s.length <= PAYLOAD_TRUNCATE_LENGTH ? s : `${s.slice(0, PAYLOAD_TRUNCATE_LENGTH)}…`;
}

/**
 * NestJS provider that owns the lifecycle of the Binance WebSocket
 * connection and the per-frame parse-and-publish loop.
 *
 * State:
 *  - `ws`: the current `WebSocket` instance, or `undefined` between
 *    a disconnect and the next `connect()` call.
 *  - `attempt`: monotonically increasing reconnect-attempt counter,
 *    reset to 0 on every successful `open`. Passed (minus one) to
 *    `nextDelayMs` so the very first reconnect uses
 *    `DEFAULT_BACKOFF_BASE_MS`. See `@price-oracle/ingestor-transport/backoff`.
 *  - `isShuttingDown`: flag set by `onModuleDestroy` so any in-flight
 *    event handler (a `close` event landing after we already started
 *    tearing down) short-circuits cleanly instead of scheduling a
 *    new reconnect.
 *  - `reconnectTimer`: the active `setTimeout` handle, also used as
 *    a "reconnect already scheduled" guard so two close events in
 *    quick succession don't pile up two timers.
 */
@Injectable()
export class BinanceService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | undefined;
  private attempt = 0;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | undefined;

  /**
   * Every parameter uses an explicit `@Inject(...)` token because
   * `tsx` (the dev runner) does not emit TypeScript's
   * `design:paramtypes` decorator metadata. Without these, NestJS
   * cannot infer the constructor's dependencies and silently
   * resolves them all to `undefined`. See CLAUDE.md operational
   * quirks: "NestJS DI under `tsx` needs explicit `@Inject()` on
   * every constructor parameter."
   */
  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    // Bind the pino "context" field to this class name so the
    // dashboard's log filter (and `pino-pretty` in dev) groups every
    // log line under `BinanceService` without each call site
    // repeating the name.
    this.logger.setContext(BinanceService.name);
  }

  /**
   * NestJS lifecycle hook: open the WebSocket as soon as the module
   * is initialized. Synchronous (no `await`) because the WS
   * handshake is event-driven — we register handlers in `connect()`
   * and return control to NestJS immediately.
   */
  onModuleInit(): void {
    this.connect();
  }

  /**
   * NestJS lifecycle hook: tear down the WebSocket and cancel any
   * pending reconnect.
   *
   * The order matters: set `isShuttingDown` *first* so any handler
   * that fires between here and `terminate()` (e.g. a `close` event
   * landing during teardown) short-circuits cleanly. Then clear the
   * reconnect timer so we don't reconnect to a Binance we no longer
   * want to talk to. Then drop all listeners on `this.ws` so a
   * late-arriving `error` event doesn't trip an unhandled
   * exception. Finally `terminate()` — which is the hard close from
   * `ws`, intentional here because graceful close has nothing to
   * drain on a read-only connection.
   */
  onModuleDestroy(): void {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.removeAllListeners();
    this.ws?.terminate();
    this.ws = undefined;
  }

  /**
   * Construct a fresh `WebSocket`, register lifecycle and message
   * handlers, and let the `ws` library do the handshake in the
   * background. Called from `onModuleInit` on boot and from
   * `scheduleReconnect` after every drop.
   *
   * Kept private — there is no scenario where an outside caller
   * should trigger a connect outside the normal lifecycle.
   */
  private connect(): void {
    // Defensive: a `scheduleReconnect` timer could fire after
    // `onModuleDestroy` set the flag but before the timer was
    // cleared. Bail without touching the network.
    if (this.isShuttingDown) return;
    this.logger.info(
      { event: 'ws.connecting', sourceId: BINANCE_SOURCE, url: this.config.binanceWsUrl },
      'Connecting to Binance WS',
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.config.binanceWsUrl);
    } catch (err) {
      // `new WebSocket(...)` can throw synchronously on malformed URLs
      // (e.g. a misconfigured env var that somehow slipped past the
      // Zod parse in `env.schema.ts`). Log and back off — the parse
      // is the real fix, but we never want this to crash the process.
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
      // A clean handshake means the previous reconnect attempts (if
      // any) are no longer relevant — reset the counter so any
      // future drop starts at the base delay again.
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
      // `error` is `warn` rather than `error`: the per-attempt error
      // is a recoverable boundary failure (CLAUDE.md rule 20), the
      // reconnect loop will retry. Reserve pino `error` level for
      // things that should page someone.
      this.logger.warn(
        { event: 'ws.error', sourceId: BINANCE_SOURCE, error: err.message },
        'Binance WS error',
      );
      if (this.isShuttingDown) return;
      this.scheduleReconnect();
    });
  }

  /**
   * Schedule the next reconnect attempt with exponential backoff.
   *
   * The single-timer guard (`if (this.reconnectTimer) return`)
   * matters because `error` and `close` events sometimes fire
   * back-to-back for the same drop; without the guard, we would
   * register two timers and end up with two parallel connects.
   *
   * The delay comes from `nextDelayMs(attempt - 1)`: we pre-bump
   * `this.attempt` so the *next* `connect()` carries the correct
   * counter for logging, but pass `attempt - 1` to the backoff
   * function because its `attempt = 0` produces the base delay (see
   * `@price-oracle/ingestor-transport/backoff` — the function tolerates
   * negative inputs by clamping to 0, so the first call after a fresh
   * `open` is well-defined).
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.ws) {
      // Drop listeners before terminate so a late `close`/`error`
      // event on the doomed socket can't double-schedule a reconnect.
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

  /**
   * Parse one raw WebSocket frame, build a `Tick`, and publish it.
   *
   * Made `public` (not `private`) so the unit tests can drive frames
   * through it without standing up the WebSocket — see
   * `binance.service.test.ts` (and matching sibling tests in the
   * Coinbase ingestor).
   *
   * Three failure paths, all of which **drop the frame and continue**:
   *
   *  1. Body is not valid JSON → `ws.frame.invalid_json` warn.
   *  2. JSON does not match `BinanceCombinedTradeEnvelopeSchema` →
   *     `ws.frame.schema_invalid` warn with the Zod issue list.
   *  3. Symbol does not map to a known `AssetId` →
   *     `ws.frame.unknown_symbol` warn.
   *
   * Every log line carries the per-frame `correlationId` so an
   * operator triaging an unusual aggregate can grep one ID and see
   * exactly where the upstream frame fell over (if it did).
   *
   * @param raw The frame payload as delivered by the `ws` library.
   *            See `utf8FromRawData` for the union it collapses.
   */
  handleMessage(raw: RawData): void {
    // One correlation ID per frame, generated here at the ingress
    // point so every log line below — and the NATS header on a
    // successful publish — share the same value. Downstream services
    // bind this ID to their pino loggers, which is what makes the
    // "grep one ID across all services" workflow work end-to-end.
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

    // Boundary parse: from this line down, `result.data` is fully
    // typed and can be trusted. The schema includes every field
    // Binance documents for `<symbol>@trade`, not just the ones we
    // read — see `trade-event.schema.ts` for why.
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
      // The combined-stream URL only subscribes to symbols we map,
      // but Binance has been known to deliver frames for adjacent
      // streams (e.g. during a subscription-set rotation). Log and
      // skip — defensive, not expected.
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

    // Build the `Tick` payload. `Number(data.p)` is safe here because
    // the `FiniteNumericString` refinement in the schema rejected
    // anything that wouldn't parse to a finite number. `Date.now()`
    // is the receive-side timestamp; `data.T` is the server-side
    // trade-fill timestamp from Binance — the aggregator's source
    // FSM uses `receivedAt` to compute freshness, so we want our own
    // clock, not the exchange's.
    const tick = {
      asset,
      source: BINANCE_SOURCE,
      price: Number(data.p),
      receivedAt: Date.now(),
      sourceTimestamp: data.T,
    };

    // `publishContract` re-validates against `TickSchema` (defense in
    // depth) and attaches the correlation ID as a NATS header. See
    // `@price-oracle/ingestor-transport/nats` for the publish
    // semantics and the `CORRELATION_HEADER` propagation contract.
    this.nats.publishContract(TickSchema, ticksSubject(asset, BINANCE_SOURCE), tick, correlationId);
  }
}
