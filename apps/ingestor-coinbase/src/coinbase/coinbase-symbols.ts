import type { AssetId } from '@price-oracle/contracts/primitives';

export const COINBASE_PRODUCT_BY_ASSET = {
  btc: 'BTC-USD',
  eth: 'ETH-USD',
} as const satisfies Record<AssetId, string>;

export type CoinbaseProductId = (typeof COINBASE_PRODUCT_BY_ASSET)[AssetId];

const ASSET_BY_COINBASE_PRODUCT: Readonly<Record<CoinbaseProductId, AssetId>> = {
  'BTC-USD': 'btc',
  'ETH-USD': 'eth',
};

export const COINBASE_ASSETS = ['btc', 'eth'] as const satisfies readonly AssetId[];

export function coinbaseProductId(asset: AssetId): CoinbaseProductId {
  return COINBASE_PRODUCT_BY_ASSET[asset];
}

export function assetFromCoinbaseProductId(productId: string): AssetId | undefined {
  if (productId in ASSET_BY_COINBASE_PRODUCT) {
    return ASSET_BY_COINBASE_PRODUCT[productId as CoinbaseProductId];
  }
  return undefined;
}
