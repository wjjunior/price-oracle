/**
 * @file Zod schemas for the Binance combined-stream "trade" event.
 *
 * This is the boundary-validation layer between the raw bytes that
 * arrive on the WebSocket and the internal `Tick` that the ingestor
 * publishes onto NATS. CLAUDE.md rule 5 ("Validate at boundaries;
 * trust types inside") is the reason the schema exists at all: the
 * `BinanceService` runs `.safeParse(...)` on every frame before
 * trusting any field. If validation fails, the message is dropped
 * with a `warn` log — see the `ws.frame.schema_invalid` log in
 * `binance.service.ts`.
 *
 * The shape comes straight from the Binance documented payload for
 * `<symbol>@trade` streams. The fields we use downstream are:
 *
 *   - `p`: trade price, **as a string** in Binance's protocol. We
 *          coerce to number at the call site, not here, because the
 *          Zod-inferred type is what feeds the schema-failure log
 *          and we want that log to show the exact wire value.
 *   - `T`: trade timestamp in ms (server-side fill time).
 *   - `s`: trading symbol, used by `assetFromBinanceSymbol` to map
 *          back to our `AssetId`.
 *
 * Other fields are kept on the schema (rather than stripped) for two
 * reasons: they give the schema-invalid log enough context to debug,
 * and they fail-loud if Binance ever silently changes the event
 * shape — better a `safeParse` warn than a missing field reaching
 * the publisher.
 *
 * The wrapping `BinanceCombinedTradeEnvelopeSchema` corresponds to
 * Binance's "combined streams" envelope: when you subscribe to
 * `?streams=btcusdt@trade/ethusdt@trade`, frames arrive as
 * `{ stream: "btcusdt@trade", data: <trade event> }` rather than as
 * the bare event. We always use the combined endpoint (see
 * `DEFAULT_BINANCE_WS_URL` in `env.schema.ts`), so the envelope is
 * the only shape this ingestor parses.
 */
import { z } from 'zod';

// Binance encodes prices and quantities as strings to preserve
// precision in the wire format. `refine` here keeps the value as a
// string (no transform — we want to show the raw value in any
// schema-invalid log) while still enforcing that it parses as a
// finite number. Empty / whitespace-only / `NaN` / `Infinity` all
// reject; a downstream `Number(...)` at the call site is then safe.
const FiniteNumericString = z
  .string()
  .refine((v) => v.trim() !== '' && Number.isFinite(Number(v)), {
    message: 'must be a non-empty string that parses as a finite number',
  });

/**
 * A single Binance `<symbol>@trade` event. Fields named per the
 * Binance docs:
 *
 *  - `e`: event type, literally `'trade'` for this stream.
 *  - `E`: event time (ms).
 *  - `s`: symbol (`BTCUSDT`, `ETHUSDT`, ...).
 *  - `t`: trade id.
 *  - `p`: price as a finite-numeric string.
 *  - `q`: quantity as a finite-numeric string.
 *  - `T`: trade time (ms) — the timestamp we use as
 *         `sourceTimestamp` on the published `Tick`.
 *  - `m`: was the buyer the market maker?
 */
export const BinanceTradeEventSchema = z.object({
  e: z.literal('trade'),
  E: z.number().int(),
  s: z.string().min(1),
  t: z.number().int(),
  p: FiniteNumericString,
  q: FiniteNumericString,
  T: z.number().int(),
  m: z.boolean(),
});
export type BinanceTradeEvent = z.infer<typeof BinanceTradeEventSchema>;

/**
 * Combined-stream envelope: every frame from the
 * `?streams=...` URL is wrapped in `{ stream, data }`. The `stream`
 * field tells you which subscribed stream this frame belongs to
 * (e.g. `'btcusdt@trade'`); we don't read it today because the
 * inner `data.s` symbol is the authoritative source for the asset
 * mapping, but it stays on the schema so an unexpected shape change
 * fails validation rather than silently mis-routing.
 */
export const BinanceCombinedTradeEnvelopeSchema = z.object({
  stream: z.string().min(1),
  data: BinanceTradeEventSchema,
});
export type BinanceCombinedTradeEnvelope = z.infer<typeof BinanceCombinedTradeEnvelopeSchema>;
