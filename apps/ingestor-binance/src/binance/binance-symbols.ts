/**
 * @file Bidirectional mapping between Binance's symbol strings
 * (`btcusdt`, `ethusdt`) and our internal `AssetId` enum (`btc`,
 * `eth`).
 *
 * The mapping lives in this app, not in `@price-oracle/contracts`,
 * because the symbol naming is **a Binance-specific concern** — the
 * Coinbase ingestor speaks `BTC-USD` / `ETH-USD` and has its own
 * sibling file. Keeping each exchange's naming local to its adapter
 * keeps `AssetId` itself exchange-agnostic.
 *
 * The pair of `as const satisfies` declarations are doing real work:
 *
 *  - `BINANCE_SYMBOL_BY_ASSET` is declared `as const` so each value
 *    keeps its literal type (`'btcusdt'`, not just `string`), and
 *    `satisfies Record<AssetId, string>` proves at compile time that
 *    every member of the closed `AssetId` enum has an entry. If a
 *    new asset is added to `AssetId` and not handled here, this file
 *    stops compiling — the boundary-validation rule (CLAUDE.md
 *    rule 5) in action at the type level.
 *
 *  - `BINANCE_ASSETS` is similarly `as const` so it widens to
 *    `readonly ['btc', 'eth']`, useful for callers iterating the
 *    asset set in a type-safe way (the sibling `binance.service.ts`
 *    does not iterate today, but the mock and any future loop-based
 *    subscription pattern would).
 *
 * The reverse map (`ASSET_BY_BINANCE_SYMBOL`) is kept file-local: only
 * `assetFromBinanceSymbol` should be consulting it, so callers can't
 * accidentally treat the raw map shape as part of the API.
 */
import type { AssetId } from '@price-oracle/contracts/primitives';

/**
 * Forward map: `AssetId` → Binance lowercase symbol.
 *
 * `as const satisfies Record<AssetId, string>` doubles as an
 * exhaustiveness check: every key in the `AssetId` enum must appear,
 * or this file fails to type-check. That is the compile-time
 * counterpart to the runtime parse-at-boundary rule.
 */
export const BINANCE_SYMBOL_BY_ASSET = {
  btc: 'btcusdt',
  eth: 'ethusdt',
} as const satisfies Record<AssetId, string>;

/**
 * Union of the literal strings on the value side of
 * `BINANCE_SYMBOL_BY_ASSET`. Today: `'btcusdt' | 'ethusdt'`. Useful
 * for narrowing the reverse lookup in `assetFromBinanceSymbol`.
 */
export type BinanceSymbol = (typeof BINANCE_SYMBOL_BY_ASSET)[AssetId];

// Reverse map, kept private. The `Readonly<Record<...>>` annotation
// is enough here — we don't need the `as const` literal widening
// because nothing reads the values as literals (consumers narrow via
// the `in` check below before indexing).
const ASSET_BY_BINANCE_SYMBOL: Readonly<Record<BinanceSymbol, AssetId>> = {
  btcusdt: 'btc',
  ethusdt: 'eth',
};

/**
 * Closed list of assets this ingestor subscribes to. Driven from
 * `AssetId` so adding a new asset there forces a compile error
 * everywhere it has to be acknowledged — including here, in the
 * default WS URL in `env.schema.ts`, and in the forward map above.
 */
export const BINANCE_ASSETS = ['btc', 'eth'] as const satisfies readonly AssetId[];

/**
 * Look up the Binance lowercase symbol for a given asset. Total
 * function: every `AssetId` has an entry, enforced at compile time
 * by `satisfies Record<AssetId, string>` on the forward map.
 */
export function binanceSymbol(asset: AssetId): BinanceSymbol {
  return BINANCE_SYMBOL_BY_ASSET[asset];
}

/**
 * Reverse lookup from a Binance symbol string to our `AssetId`.
 *
 * Used by `BinanceService.handleMessage` to translate the `s` field
 * of a trade event into the asset dimension we use everywhere else
 * (NATS subject, audit collection, dashboard slice).
 *
 * Returns `undefined` when the symbol is not one we know about,
 * which is a *defensive* check: the Binance combined-stream URL is
 * constructed to only subscribe to symbols we map, but the API does
 * sometimes deliver frames for adjacent streams (e.g. on stream-list
 * changes), and we'd rather log a `ws.frame.unknown_symbol` warning
 * than crash on a missing index.
 *
 * @param symbol Raw `s` field from the Binance trade event. Case is
 *               normalized to lowercase before lookup because
 *               Binance has occasionally returned mixed-case strings
 *               in beta endpoints.
 * @returns `AssetId` if recognized, `undefined` otherwise.
 */
export function assetFromBinanceSymbol(symbol: string): AssetId | undefined {
  const normalized = symbol.toLowerCase();
  // `in`-check first so the index expression below stays a typed
  // lookup on the narrow `BinanceSymbol` keyset rather than an
  // any-cast on a raw string.
  if (normalized in ASSET_BY_BINANCE_SYMBOL) {
    return ASSET_BY_BINANCE_SYMBOL[normalized as BinanceSymbol];
  }
  return undefined;
}
