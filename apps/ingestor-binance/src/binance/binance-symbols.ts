import type { AssetId } from '@price-oracle/contracts/primitives';

export const BINANCE_SYMBOL_BY_ASSET = {
  btc: 'btcusdt',
  eth: 'ethusdt',
} as const satisfies Record<AssetId, string>;

export type BinanceSymbol = (typeof BINANCE_SYMBOL_BY_ASSET)[AssetId];

const ASSET_BY_BINANCE_SYMBOL: Readonly<Record<BinanceSymbol, AssetId>> = {
  btcusdt: 'btc',
  ethusdt: 'eth',
};

export const BINANCE_ASSETS = ['btc', 'eth'] as const satisfies readonly AssetId[];

export function binanceSymbol(asset: AssetId): BinanceSymbol {
  return BINANCE_SYMBOL_BY_ASSET[asset];
}

export function assetFromBinanceSymbol(symbol: string): AssetId | undefined {
  const normalized = symbol.toLowerCase();
  if (normalized in ASSET_BY_BINANCE_SYMBOL) {
    return ASSET_BY_BINANCE_SYMBOL[normalized as BinanceSymbol];
  }
  return undefined;
}
