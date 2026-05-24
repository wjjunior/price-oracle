/**
 * @file The Coinbase WebSocket adapter — the heart of this ingestor.
 *
 * Sibling of `apps/ingestor-binance/src/binance/binance.service.ts`,
 * with the same overall shape (connect → parse → publish, exponential
 * backoff on reconnect) but a richer message path because Coinbase's
 * Advanced Trade WS protocol is multi-channel and multi-frame-type.
 *
 * Responsibilities, in the order they occur on the data path:
 *
 *  1. **Maintain a long-lived WebSocket connection** to
 *     `wss://advanced-trade-ws.coinbase.com` (see
 *     `DEFAULT_COINBASE_WS_URL` in `../config/env.schema.ts`).
 *     Reconnect uses exponential backoff with jitter from
 *     `@price-oracle/ingestor-transport/backoff` — see that file's
 *     header for the shape of the curve and why jitter matters.
 *
 *  2. **Send the subscribe handshake on connect.** Coinbase requires
 *     the client to send a `{ type: 'subscribe', channel:
 *     'market_trades', product_ids: [...] }` frame after the WS
 *     handshake completes; until that frame is delivered, no trade
 *     data arrives. The message body is built once at module load by
 *     `./subscribe.ts`; the `ws.on('open', ...)` handler below
 *     `JSON.stringify`s it and pushes it onto the socket. This is the
 *     protocol-level difference from the Binance ingestor, which
 *     encodes its stream list in the URL query string and streams
 *     immediately on connect.
 *
 *  3. **Discriminate each inbound frame** with two parses, in order:
 *     - First against `ErrorFrameSchema` (`./error-frame.schema.ts`)
 *       because Coinbase error envelopes have no `channel` field and
 *       cannot live in the channelled discriminated union below.
 *     - Then against `FrameSchema` (`./frame.schema.ts`), a Zod
 *       `discriminatedUnion` over `channel`. On a successful parse,
 *       `frame.channel` narrows to either `'market_trades'`
 *       (data) or `'subscriptions'` (subscribe confirmation). Binance
 *       only delivers one frame type, so it gets away with a single
 *       envelope schema.
 *
 *  4. **For each `market_trades` event, parse and publish each trade
 *     individually.** Coinbase batches multiple trades per event and
 *     multiple events per frame, so the service iterates both layers
 *     and runs `TradeSchema.safeParse` per entry. That lets a single
 *     malformed trade drop just itself, not the whole batch — see
 *     `market-trades.schema.ts` for the rationale.
 *
 *  5. **Build a contract `Tick`** by combining the parsed trade with
 *     `Date.now()` for `receivedAt`, the parsed ISO `time` for
 *     `sourceTimestamp`, and the symbol reverse-map for `asset`. The
 *     `Tick` shape itself lives in `@price-oracle/contracts/events`.
 *
 *  6. **Publish on NATS** via the shared `NatsService` adapter
 *     (`@price-oracle/ingestor-transport/nats`), which re-validates
 *     against `TickSchema` and attaches the `correlationId` to the
 *     NATS message header. The correlation ID is generated *per trade*
 *     here (via `randomUUID()`), then flows end-to-end: ingestor pino
 *     logs → NATS header → aggregator pino logs → SSE envelope →
 *     dashboard audit timeline (CLAUDE.md operational quirks →
 *     "Correlation IDs propagate end-to-end").
 *
 * What this service does **not** do — and on purpose:
 *
 *  - **No admin / chaos surface.** Real ingestors are
 *    observation-only; only the mock has `/admin/:asset/...` chaos
 *    endpoints (CLAUDE.md operational quirks → "Mock ingestor admin
 *    API is dev-only"). Coinbase failures are observed in the field
 *    (rate limits, malformed payloads, drops), never injected.
 *  - **No domain logic.** No source health, no breaker state, no
 *    aggregation. Those live in `apps/aggregator/src/domain/`. This
 *    file's job is to translate Coinbase's wire format into the
 *    shared `Tick` contract and put it on the bus; everything else is
 *    downstream.
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

import { assetFromCoinbaseProductId } from './coinbase-symbols.js';
import { ErrorFrameSchema } from './error-frame.schema.js';
import { FrameSchema } from './frame.schema.js';
import { TradeSchema } from './market-trades.schema.js';
import { COINBASE_SOURCE } from './source.js';
import { MARKET_TRADES_SUBSCRIBE } from './subscribe.js';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

// Cap on how many characters of a malformed/invalid frame we include
// in a `warn` log. The point of the log is reproduction, not archival,
// and pino lines get expensive past a few KB. Truncation preserves the
// head of the payload (where the offending field usually is) and
// appends `…` so the operator can tell at a glance the line was clipped.
const PAYLOAD_TRUNCATE_LENGTH = 256;

/**
 * Coerce whatever the `ws` library gives us on a `message` event into
 * a UTF-8 string. `ws` types the payload as `RawData`, a union of
 * `string | Buffer | ArrayBuffer | Buffer[]` — each variant comes from
 * a different code path (text vs binary frame, single vs fragmented
 * frame) and we collapse them all here so the JSON parse downstream
 * only deals with strings.
 *
 * The `Buffer.concat` branch handles fragmented frames (a single
 * logical message split across multiple TCP reads); `ws` delivers
 * those as an array of `Buffer`s.
 *
 * Identical to the Binance ingestor's helper — kept inline rather
 * than extracted to a shared package under rule 18 (rule of three
 * before extracting); the mock ingestor does not need it, so two
 * copies remain the right call.
 */
function utf8FromRawData(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return Buffer.concat(raw).toString('utf8');
}

/**
 * Cap log payloads at `PAYLOAD_TRUNCATE_LENGTH` chars and mark
 * truncation with a trailing ellipsis. See the constant's comment for
 * why we truncate at all.
 */
function truncate(s: string): string {
  return s.length <= PAYLOAD_TRUNCATE_LENGTH ? s : `${s.slice(0, PAYLOAD_TRUNCATE_LENGTH)}…`;
}

/**
 * NestJS provider that owns the lifecycle of the Coinbase WebSocket
 * connection, the subscribe handshake, and the per-trade parse-and-publish
 * loop.
 *
 * State:
 *  - `ws`: the current `WebSocket` instance, or `undefined` between a
 *    disconnect and the next `connect()` call.
 *  - `attempt`: monotonically increasing reconnect-attempt counter,
 *    reset to 0 on every successful `open`. Passed (minus one) to
 *    `nextDelayMs` so the very first reconnect uses
 *    `DEFAULT_BACKOFF_BASE_MS`. See `@price-oracle/ingestor-transport/backoff`.
 *  - `isShuttingDown`: flag set by `onModuleDestroy` so any in-flight
 *    event handler (a `close` event landing after we already started
 *    tearing down) short-circuits cleanly instead of scheduling a new
 *    reconnect.
 *  - `reconnectTimer`: the active `setTimeout` handle, also used as a
 *    "reconnect already scheduled" guard so two close events in quick
 *    succession don't pile up two timers.
 */
@Injectable()
export class CoinbaseService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | undefined;
  private attempt = 0;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | undefined;

  /**
   * Every parameter uses an explicit `@Inject(...)` token because
   * `tsx` (the dev runner) does not emit TypeScript's
   * `design:paramtypes` decorator metadata. Without these, NestJS
   * cannot infer the constructor's dependencies and silently resolves
   * them all to `undefined`. See CLAUDE.md operational quirks: "NestJS
   * DI under `tsx` needs explicit `@Inject()` on every constructor
   * parameter."
   */
  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    // Bind the pino "context" field to this class name so the
    // dashboard's log filter (and `pino-pretty` in dev) groups every
    // log line under `CoinbaseService` without each call site
    // repeating the name.
    this.logger.setContext(CoinbaseService.name);
  }

  /**
   * NestJS lifecycle hook: open the WebSocket as soon as the module
   * is initialized. Synchronous (no `await`) because the WS handshake
   * is event-driven — we register handlers in `connect()` and return
   * control to NestJS immediately. The subscribe message is sent
   * from the `open` handler, not here, so it always runs *after* the
   * WS handshake completes.
   */
  onModuleInit(): void {
    this.connect();
  }

  /**
   * NestJS lifecycle hook: tear down the WebSocket and cancel any
   * pending reconnect.
   *
   * Same shutdown ordering as the Binance sibling: set `isShuttingDown`
   * *first* so any handler that fires between here and `terminate()`
   * (e.g. a `close` event landing during teardown) short-circuits
   * cleanly. Then clear the reconnect timer so we don't reconnect to
   * a Coinbase we no longer want to talk to. Then drop all listeners
   * on `this.ws` so a late-arriving `error` event doesn't trip an
   * unhandled exception. Finally `terminate()` — the hard close from
   * `ws`, intentional here because graceful close has nothing to drain
   * on a read-only-after-subscribe connection.
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
   * Kept private — there is no scenario where an outside caller should
   * trigger a connect outside the normal lifecycle.
   */
  private connect(): void {
    // Defensive: a `scheduleReconnect` timer could fire after
    // `onModuleDestroy` set the flag but before the timer was cleared.
    // Bail without touching the network.
    if (this.isShuttingDown) return;
    this.logger.info(
      { event: 'ws.connecting', sourceId: COINBASE_SOURCE, url: this.config.coinbaseWsUrl },
      'Connecting to Coinbase WS',
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.config.coinbaseWsUrl);
    } catch (err) {
      // `new WebSocket(...)` can throw synchronously on malformed URLs
      // (e.g. a misconfigured env var that somehow slipped past the
      // Zod parse in `env.schema.ts`). Log and back off — the parse is
      // the real fix, but we never want this to crash the process.
      this.logger.warn(
        {
          event: 'ws.construct.failed',
          sourceId: COINBASE_SOURCE,
          error: err instanceof Error ? err.message : String(err),
        },
        'Coinbase WS construct failed',
      );
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      // A clean handshake means the previous reconnect attempts (if
      // any) are no longer relevant — reset the counter so any future
      // drop starts at the base delay again.
      this.attempt = 0;
      // The protocol-level difference from Binance: send the subscribe
      // payload immediately on `open`. Without this, the broker
      // accepts the WS connection but delivers no `market_trades`
      // events. The payload is a constant built at module load (see
      // `subscribe.ts`), so `JSON.stringify` is the only per-connect
      // work here.
      ws.send(JSON.stringify(MARKET_TRADES_SUBSCRIBE));
      this.logger.info(
        { event: 'ws.open', sourceId: COINBASE_SOURCE },
        'Coinbase WS connected and subscribed to market_trades',
      );
    });

    ws.on('message', (raw) => this.handleMessage(raw));

    ws.on('close', () => {
      if (this.isShuttingDown) return;
      this.logger.info(
        { event: 'ws.close', sourceId: COINBASE_SOURCE },
        'Coinbase WS closed; scheduling reconnect',
      );
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      // `error` is `warn` rather than `error`: the per-attempt error
      // is a recoverable boundary failure (CLAUDE.md rule 20), the
      // reconnect loop will retry. Reserve pino `error` level for
      // things that should page someone.
      this.logger.warn(
        { event: 'ws.error', sourceId: COINBASE_SOURCE, error: err.message },
        'Coinbase WS error',
      );
      if (this.isShuttingDown) return;
      this.scheduleReconnect();
    });
  }

  /**
   * Schedule the next reconnect attempt with exponential backoff.
   *
   * The single-timer guard (`if (this.reconnectTimer) return`) matters
   * because `error` and `close` events sometimes fire back-to-back for
   * the same drop; without the guard, we would register two timers
   * and end up with two parallel connects.
   *
   * The delay comes from `nextDelayMs(attempt - 1)`: we pre-bump
   * `this.attempt` so the *next* `connect()` carries the correct
   * counter for logging, but pass `attempt - 1` to the backoff function
   * because its `attempt = 0` produces the base delay (see
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
        sourceId: COINBASE_SOURCE,
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
   * Parse one raw WebSocket frame and dispatch it.
   *
   * Made `public` (not `private`) so the unit tests can drive frames
   * through it without standing up the WebSocket — same pattern as the
   * Binance sibling's test seam.
   *
   * Note this method does **not** generate a correlation ID. Unlike
   * Binance, where one frame = one trade = one correlation ID, a
   * Coinbase frame can carry many trades; the per-trade correlation
   * IDs are generated inside `publishTrade` so each trade gets its own
   * end-to-end traceable id even when it shares a frame with siblings.
   *
   * Frame dispatch, in priority order:
   *
   *  1. **Invalid JSON** → drop with `ws.frame.invalid_json` warn.
   *  2. **Error envelope** → speculative parse against `ErrorFrameSchema`
   *     first, because Coinbase error frames have no `channel` field
   *     and can't live in the discriminated union. Log the first
   *     error's `id` and `message` and drop.
   *  3. **Channelled frame** → parse against the
   *     `discriminatedUnion('channel', ...)` from `FrameSchema`. On a
   *     `subscriptions` confirmation, log at `debug` and return — the
   *     frame is only useful for tracing the handshake. On a
   *     `market_trades` frame, iterate the batched events (skipping
   *     `snapshot` events for now; we only ingest live updates) and
   *     pass each trade to `publishTrade`.
   *  4. **Anything else** → schema-invalid warn and drop. Defensive
   *     against Coinbase emitting an unsolicited frame on an
   *     unsubscribed channel.
   */
  handleMessage(raw: RawData): void {
    const text = utf8FromRawData(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      this.logger.warn(
        {
          event: 'ws.frame.invalid_json',
          sourceId: COINBASE_SOURCE,
          payload: truncate(text),
          error: err instanceof Error ? err.message : String(err),
        },
        'Coinbase frame is not valid JSON',
      );
      return;
    }

    // Error frames first — they have no `channel`, so they would
    // otherwise fall through to the discriminated-union parse and be
    // mis-classified as `schema_invalid`. Speculative `safeParse` is
    // cheap and lets us surface the broker's error id/message
    // verbatim in the operator log.
    const errorFrame = ErrorFrameSchema.safeParse(parsed);
    if (errorFrame.success) {
      const first = errorFrame.data.errors[0];
      this.logger.warn(
        {
          event: 'ws.error_frame',
          sourceId: COINBASE_SOURCE,
          errorId: first.id,
          message: first.message,
        },
        'Coinbase error frame',
      );
      return;
    }

    // Boundary parse: from this line down, `result.data` is fully typed
    // and can be trusted. The union narrows on `frame.channel` below.
    const result = FrameSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'ws.frame.schema_invalid',
          sourceId: COINBASE_SOURCE,
          payload: truncate(text),
          issues: result.error.issues,
        },
        'Coinbase frame failed schema validation',
      );
      return;
    }

    const frame = result.data;
    if (frame.channel === 'subscriptions') {
      // Subscribe confirmation — purely a control-plane signal. `debug`
      // rather than `info` because once the connection is stable, the
      // confirmation is noise; an operator only needs it when they are
      // tracing why subscribe is or isn't completing.
      this.logger.debug(
        { event: 'ws.subscription_confirmed', sourceId: COINBASE_SOURCE },
        'Subscription confirmed',
      );
      return;
    }

    // `frame.channel` has narrowed to `'market_trades'`. Coinbase
    // batches updates: one frame can contain multiple events, each
    // event can contain multiple trades. The two nested loops below
    // unroll that into per-trade publish calls. The `snapshot` event
    // type is filtered out here — we ingest only live updates, not the
    // historical snapshot the broker sends on (re)subscribe.
    for (const event of frame.events) {
      if (event.type !== 'update') continue;
      for (const rawTrade of event.trades) {
        this.publishTrade(rawTrade);
      }
    }
  }

  /**
   * Validate a single trade entry, build a `Tick`, and publish it.
   *
   * Per-entry parse (rather than parse-the-whole-array-up-front in the
   * schema) is deliberate — see `market-trades.schema.ts`. It means a
   * single malformed trade inside a batch is dropped on its own, with
   * its own correlation ID, while sibling trades in the same frame
   * publish normally.
   *
   * Three failure paths, all of which **drop the trade and continue**:
   *
   *  1. Trade body does not match `TradeSchema` → `ws.trade.invalid` warn.
   *  2. `product_id` does not map to a known `AssetId` →
   *     `ws.trade.unknown_product` warn. (The subscribe handshake only
   *     enrolls product ids we map, so this is defensive against
   *     channel-rotation edge cases.)
   *  3. Implicitly: `NatsService.publishContract` re-validates against
   *     `TickSchema` and refuses to send if validation fails. That is
   *     defense-in-depth: a regression in the mapping below would be
   *     caught there too.
   */
  private publishTrade(rawTrade: unknown): void {
    // One correlation ID *per trade* (not per frame), generated here
    // at the granularity of a published `Tick` so each unit of work
    // downstream has its own end-to-end traceable id. Same end-to-end
    // contract as the Binance sibling, just generated one level deeper.
    const correlationId = randomUUID();
    const result = TradeSchema.safeParse(rawTrade);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'ws.trade.invalid',
          sourceId: COINBASE_SOURCE,
          correlationId,
          issues: result.error.issues,
        },
        'Coinbase trade failed schema validation',
      );
      return;
    }
    const trade = result.data;
    const asset = assetFromCoinbaseProductId(trade.product_id);
    if (!asset) {
      this.logger.warn(
        {
          event: 'ws.trade.unknown_product',
          sourceId: COINBASE_SOURCE,
          correlationId,
          productId: trade.product_id,
        },
        'Coinbase trade carries an unknown product_id',
      );
      return;
    }

    // Build the `Tick` payload. `Number(trade.price)` is safe because
    // the `FiniteNumericString` refinement in the schema rejected
    // anything that wouldn't parse to a finite number. `Date.now()` is
    // the receive-side timestamp; `new Date(trade.time).getTime()`
    // converts Coinbase's ISO-8601 string to millis-since-epoch (the
    // `Millis` primitive's unit). The aggregator's source FSM uses
    // `receivedAt` to compute freshness, so we want our own clock, not
    // the exchange's.
    const tick = {
      asset,
      source: COINBASE_SOURCE,
      price: Number(trade.price),
      receivedAt: Date.now(),
      sourceTimestamp: new Date(trade.time).getTime(),
    };

    // `publishContract` re-validates against `TickSchema` (defense in
    // depth) and attaches the correlation ID as a NATS header. See
    // `@price-oracle/ingestor-transport/nats` for the publish
    // semantics and the `CORRELATION_HEADER` propagation contract.
    this.nats.publishContract(TickSchema, ticksSubject(asset, COINBASE_SOURCE), tick, correlationId);
  }
}
