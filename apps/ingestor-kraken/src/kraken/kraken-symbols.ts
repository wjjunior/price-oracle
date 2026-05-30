import type { AssetId } from '@price-oracle/contracts/primitives';

export const KRAKEN_SYMBOL_BY_ASSET = {
  btc: 'BTC/USD',
  eth: 'ETH/USD',
} as const satisfies Record<AssetId, string>;

export type KrakenSymbol = (typeof KRAKEN_SYMBOL_BY_ASSET)[AssetId];

const ASSET_BY_KRAKEN_SYMBOL: Readonly<Record<KrakenSymbol, AssetId>> = {
  'BTC/USD': 'btc',
  'ETH/USD': 'eth',
};

export const KRAKEN_ASSETS = ['btc', 'eth'] as const satisfies readonly AssetId[];

export function krakenSymbol(asset: AssetId): KrakenSymbol {
  return KRAKEN_SYMBOL_BY_ASSET[asset];
}

export function assetFromKrakenSymbol(symbol: string): AssetId | undefined {
  if (symbol in ASSET_BY_KRAKEN_SYMBOL) {
    return ASSET_BY_KRAKEN_SYMBOL[symbol as KrakenSymbol];
  }
  return undefined;
}
