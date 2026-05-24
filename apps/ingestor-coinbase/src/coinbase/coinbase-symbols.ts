/**
 * @file Bidirectional mapping between Coinbase's "product id" strings
 * (`BTC-USD`, `ETH-USD`) and our internal `AssetId` enum (`btc`,
 * `eth`).
 *
 * The mapping lives in this app, not in `@price-oracle/contracts`,
 * because the product-id naming is **a Coinbase-specific concern** —
 * the Binance ingestor speaks `btcusdt` / `ethusdt` and has its own
 * sibling file (`apps/ingestor-binance/src/binance/binance-symbols.ts`).
 * Keeping each exchange's naming local to its adapter keeps `AssetId`
 * itself exchange-agnostic.
 *
 * Two non-obvious things this file does that pay off downstream:
 *
 *  1. `COINBASE_PRODUCT_BY_ASSET` is `as const satisfies Record<AssetId,
 *     string>`. The `as const` keeps each value as its literal type
 *     (`'BTC-USD'`, not just `string`); the `satisfies` clause proves
 *     at compile time that every member of the closed `AssetId` enum
 *     has an entry. If a new asset is ever added to `AssetId` and not
 *     handled here, this file stops compiling — the boundary-validation
 *     rule (CLAUDE.md rule 5) in action at the type level.
 *
 *  2. `COINBASE_ASSETS` exposes the asset set as a `readonly` tuple,
 *     which `subscribe.ts` iterates to build the `product_ids` list on
 *     the Coinbase subscribe frame. That ties the subscribe payload to
 *     the same compile-time-checked source of truth as the reverse
 *     mapping, so a typo in either place would not silently fall
 *     through.
 *
 * The reverse map (`ASSET_BY_COINBASE_PRODUCT`) is kept file-local: only
 * `assetFromCoinbaseProductId` should be consulting it, so callers
 * can't accidentally treat the raw map shape as part of the API.
 */
import type { AssetId } from '@price-oracle/contracts/primitives';

/**
 * Forward map: `AssetId` → Coinbase product id.
 *
 * `as const satisfies Record<AssetId, string>` doubles as an
 * exhaustiveness check: every key in the `AssetId` enum must appear,
 * or this file fails to type-check. That is the compile-time
 * counterpart to the runtime parse-at-boundary rule.
 */
export const COINBASE_PRODUCT_BY_ASSET = {
  btc: 'BTC-USD',
  eth: 'ETH-USD',
} as const satisfies Record<AssetId, string>;

/**
 * Union of the literal strings on the value side of
 * `COINBASE_PRODUCT_BY_ASSET`. Today: `'BTC-USD' | 'ETH-USD'`. Useful
 * for narrowing the reverse lookup in `assetFromCoinbaseProductId`.
 */
export type CoinbaseProductId = (typeof COINBASE_PRODUCT_BY_ASSET)[AssetId];

// Reverse map, kept private. The `Readonly<Record<...>>` annotation is
// enough here — we don't need the `as const` literal widening because
// nothing reads the values as literals (consumers narrow via the `in`
// check below before indexing).
const ASSET_BY_COINBASE_PRODUCT: Readonly<Record<CoinbaseProductId, AssetId>> = {
  'BTC-USD': 'btc',
  'ETH-USD': 'eth',
};

/**
 * Closed list of assets this ingestor subscribes to. Driven from
 * `AssetId` so adding a new asset there forces a compile error
 * everywhere it has to be acknowledged — including here, in the
 * forward map above, and in the subscribe-message builder
 * (`subscribe.ts`) which iterates this tuple to populate `product_ids`.
 */
export const COINBASE_ASSETS = ['btc', 'eth'] as const satisfies readonly AssetId[];

/**
 * Look up the Coinbase product id for a given asset. Total function:
 * every `AssetId` has an entry, enforced at compile time by
 * `satisfies Record<AssetId, string>` on the forward map.
 *
 * Called by `subscribe.ts` when assembling the `product_ids` array on
 * the outbound subscribe frame.
 */
export function coinbaseProductId(asset: AssetId): CoinbaseProductId {
  return COINBASE_PRODUCT_BY_ASSET[asset];
}

/**
 * Reverse lookup from a Coinbase product id back to our `AssetId`.
 *
 * Used by `CoinbaseService.publishTrade` to translate the `product_id`
 * field of a trade event into the asset dimension we use everywhere
 * else (NATS subject, audit collection, dashboard slice).
 *
 * Returns `undefined` when the product is not one we know about, which
 * is a *defensive* check: the subscribe handshake (`subscribe.ts`)
 * only enrolls product ids we map, but the Coinbase API can deliver
 * unsolicited events around channel rotations or after the broker
 * adjusts a subscription, and we'd rather log a `ws.trade.unknown_product`
 * warning than crash on a missing index.
 *
 * @param productId Raw `product_id` field from a Coinbase trade entry.
 *                  Compared verbatim (case-sensitive) because Coinbase's
 *                  documented form is fixed-case `<BASE>-<QUOTE>`.
 * @returns `AssetId` if recognized, `undefined` otherwise.
 */
export function assetFromCoinbaseProductId(productId: string): AssetId | undefined {
  // `in`-check first so the index expression below stays a typed
  // lookup on the narrow `CoinbaseProductId` keyset rather than an
  // any-cast on a raw string.
  if (productId in ASSET_BY_COINBASE_PRODUCT) {
    return ASSET_BY_COINBASE_PRODUCT[productId as CoinbaseProductId];
  }
  return undefined;
}
