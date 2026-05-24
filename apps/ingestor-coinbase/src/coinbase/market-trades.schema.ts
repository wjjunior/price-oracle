/**
 * @file Zod schemas for the Coinbase Advanced Trade `market_trades`
 * channel.
 *
 * This is the boundary-validation layer between the raw bytes that
 * arrive on the WebSocket and the internal `Tick` that the ingestor
 * publishes onto NATS. CLAUDE.md rule 5 ("Validate at boundaries;
 * trust types inside") is the reason the schema exists at all:
 * `CoinbaseService` runs `.safeParse(...)` on every frame and on every
 * individual trade entry before trusting any field. Validation
 * failures are dropped with a `warn` log — see the `ws.frame.schema_invalid`
 * and `ws.trade.invalid` log sites in `coinbase.service.ts`.
 *
 * Structure of a Coinbase `market_trades` frame, from outermost to
 * innermost (and matched by the three schemas below in reverse order):
 *
 *   frame { channel: 'market_trades', timestamp, sequence_num,
 *           events: [
 *             event { type: 'snapshot' | 'update',
 *                     trades: [
 *                       { trade_id, product_id, price, size, side, time },
 *                       ...
 *                     ] },
 *             ...
 *           ] }
 *
 * Two protocol details worth highlighting, because they differ from
 * Binance:
 *
 *  1. **Frames are batched.** A single Coinbase frame can carry
 *     multiple `events`, each of which can carry multiple `trades`.
 *     The service iterates both layers (see the `for (const event ...)`
 *     loop in `coinbase.service.ts`). Binance's `<symbol>@trade` stream
 *     delivers one trade per frame.
 *
 *  2. **Two event types.** On (re)subscribe, Coinbase emits a
 *     `snapshot` event followed by `update` events. We treat both
 *     uniformly here at the schema level — the filtering ("skip
 *     anything that isn't `update`") happens in the service so the
 *     parsed type stays simple and so a future requirement to consume
 *     snapshots wouldn't need a schema change. Notice
 *     `MarketTradesEventSchema.trades` is typed as `z.array(z.unknown())`:
 *     we *defer* per-trade validation to `TradeSchema`, parsed
 *     entry-by-entry in `publishTrade`. That lets a single malformed
 *     trade in a batch drop just itself, not the whole frame.
 */
import { z } from 'zod';

// Coinbase encodes prices and sizes as strings to preserve precision
// in the wire format. `refine` here keeps the value as a string (no
// transform — we want to show the raw value in any schema-invalid log)
// while still enforcing that it parses as a finite number. Empty /
// whitespace-only / `NaN` / `Infinity` all reject; a downstream
// `Number(...)` at the call site is then safe. Same pattern as the
// Binance schema; both ingestors face the same precision-vs-typing
// trade-off so the refinement is identical.
const FiniteNumericString = z
  .string()
  .refine((v) => v.trim() !== '' && Number.isFinite(Number(v)), {
    message: 'must be a non-empty string that parses as a finite number',
  });

/**
 * `side` is documented as either `BUY` or `SELL`. Kept as a Zod enum
 * so a future Coinbase change introducing a third value fails the
 * parse loudly rather than silently coercing.
 */
export const TradeSideSchema = z.enum(['BUY', 'SELL']);

/**
 * A single trade entry inside a `market_trades` event.
 *
 *  - `trade_id`: Coinbase's monotonically-increasing trade id (string).
 *  - `product_id`: e.g. `'BTC-USD'`. Mapped to `AssetId` by
 *                  `assetFromCoinbaseProductId`; an unknown product
 *                  drops the trade with `ws.trade.unknown_product`.
 *  - `price`: trade price, as a finite-numeric string.
 *  - `size`: trade size, as a finite-numeric string.
 *  - `side`: `'BUY'` or `'SELL'`. Read for completeness; not used
 *            downstream today.
 *  - `time`: ISO-8601 UTC timestamp of the trade match. Parsed via
 *            `new Date(...).getTime()` at the call site so the
 *            published `Tick.sourceTimestamp` is in millis-since-epoch,
 *            matching the `Millis` primitive in
 *            `@price-oracle/contracts/primitives`. Note this is the
 *            *exchange-side* fill time; the aggregator's freshness
 *            scoring uses our own `receivedAt`, not this field.
 */
export const TradeSchema = z.object({
  trade_id: z.string().min(1),
  product_id: z.string().min(1),
  price: FiniteNumericString,
  size: FiniteNumericString,
  side: TradeSideSchema,
  time: z.iso.datetime(),
});
export type Trade = z.infer<typeof TradeSchema>;

/**
 * One event inside a frame's `events` array.
 *
 * `trades` is typed `z.array(z.unknown())` deliberately — see this
 * file's header for the rationale: per-trade validation runs once per
 * entry in `publishTrade`, so a single malformed trade does not
 * invalidate the whole batch.
 */
export const MarketTradesEventSchema = z.object({
  type: z.enum(['snapshot', 'update']),
  trades: z.array(z.unknown()),
});

/**
 * Outer frame for the `market_trades` channel. The literal
 * `channel: 'market_trades'` is the discriminator that
 * `FrameSchema`'s `z.discriminatedUnion` keys off (see `frame.schema.ts`)
 * — it is what lets Zod pick this branch deterministically over
 * `SubscriptionsFrameSchema` without a fallthrough parse.
 *
 *  - `timestamp`: ISO datetime, server-side at frame emission.
 *  - `sequence_num`: monotonic per-channel sequence; we accept it but
 *                    do not enforce ordering here — that responsibility
 *                    sits with the aggregator's source FSM. Kept on the
 *                    schema to fail-loud if Coinbase ever changes the
 *                    field's type.
 *  - `events`: one or more events, see `MarketTradesEventSchema`.
 */
export const MarketTradesFrameSchema = z.object({
  channel: z.literal('market_trades'),
  timestamp: z.iso.datetime(),
  sequence_num: z.number().int().nonnegative(),
  events: z.array(MarketTradesEventSchema),
});
export type MarketTradesFrame = z.infer<typeof MarketTradesFrameSchema>;
