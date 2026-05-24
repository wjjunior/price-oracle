/**
 * @file The outbound subscribe handshake — the protocol-level
 * difference from the Binance ingestor.
 *
 * Coinbase's Advanced Trade WebSocket multiplexes every product and
 * every channel over a single URL (`wss://advanced-trade-ws.coinbase.com`,
 * see `config/env.schema.ts`). To begin receiving trades, the client
 * must send a JSON `subscribe` frame *after* the WS handshake
 * completes, naming the channel and the product ids it wants. Until
 * that frame is delivered (and confirmed by a `subscriptions` frame
 * back from the broker — see `frame.schema.ts`), no trade data flows.
 *
 * Compare with `apps/ingestor-binance/`: Binance encodes its
 * subscription set in the WS URL query string
 * (`?streams=btcusdt@trade/ethusdt@trade`) and starts streaming
 * immediately on connect. That URL-embedded approach is one of two
 * patterns big exchanges use; Coinbase's send-a-subscribe pattern is
 * the other. Neither is "better" — Coinbase's lets you change the
 * subscription mid-connection by sending another subscribe (or an
 * unsubscribe) frame without reconnecting, which the
 * `decisions.md` "Hexagonal hybrid" entry calls the "Coinbase channel
 * matrix" complexity that makes a ports/adapters layer on the
 * ingestors counter-productive.
 *
 * Implementation details worth noticing:
 *
 *  - The message body is built **at module load**, not on every
 *    connect. That is safe because the product list is a closed,
 *    typed set derived from `AssetId`, and the resulting object never
 *    mutates. The service serializes it via `JSON.stringify(...)` in
 *    its `ws.on('open', ...)` handler.
 *  - `COINBASE_ASSETS.map(coinbaseProductId)` ties the subscription
 *    set to the same compile-time-checked source of truth as the
 *    reverse mapping in `coinbase-symbols.ts`. A new asset added to
 *    `AssetId` propagates everywhere by force-failing each of the
 *    `satisfies Record<AssetId, ...>` clauses, not by manual sync.
 *  - We do not subscribe to a `heartbeats` channel. Coinbase will
 *    close an idle connection eventually, but our reconnect-with-backoff
 *    loop (`@price-oracle/ingestor-transport/backoff`) handles that
 *    transparently. Adding `heartbeats` would mean adding another
 *    subscribe message and another branch to `FrameSchema`.
 *  - Authentication: `market_trades` is a public channel and requires
 *    no API key. If a future requirement forces us into an
 *    authenticated channel, the `SubscribeMessage` type would need to
 *    grow `api_key` / `timestamp` / `signature` fields per the
 *    Coinbase docs.
 */
import { COINBASE_ASSETS, coinbaseProductId } from './coinbase-symbols.js';

/**
 * Shape of the JSON object Coinbase expects on the wire for a subscribe
 * action.
 *
 * Marked `readonly` end-to-end because the constant below is reused on
 * every reconnect (`JSON.stringify` is a pure read); mutation would
 * silently change subsequent reconnects' behavior in surprising ways.
 *
 * Today only `market_trades` is supported. The literal type leaves
 * room to widen as a union (e.g. `'market_trades' | 'level2'`) when a
 * second channel is genuinely needed; pre-emptive widening would be a
 * rule 18 violation ("rule of three before extracting").
 */
export type SubscribeMessage = {
  readonly type: 'subscribe';
  readonly channel: 'market_trades';
  readonly product_ids: readonly string[];
};

/**
 * The one and only subscribe payload this ingestor sends, materialized
 * at module load. Dispatched by `CoinbaseService` from its
 * `ws.on('open', ...)` handler, immediately after the WS handshake
 * completes and the reconnect-attempt counter is reset. A successful
 * subscribe is acknowledged by a `subscriptions` frame (see
 * `SubscriptionsFrameSchema` in `frame.schema.ts`) which the service
 * logs at `debug`.
 */
export const MARKET_TRADES_SUBSCRIBE: SubscribeMessage = {
  type: 'subscribe',
  channel: 'market_trades',
  product_ids: COINBASE_ASSETS.map(coinbaseProductId),
};
