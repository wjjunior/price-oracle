import { COINBASE_ASSETS, coinbaseProductId } from './coinbase-symbols.js';

export type SubscribeMessage = {
  readonly type: 'subscribe';
  readonly channel: 'market_trades';
  readonly product_ids: readonly string[];
};

export const MARKET_TRADES_SUBSCRIBE: SubscribeMessage = {
  type: 'subscribe',
  channel: 'market_trades',
  product_ids: COINBASE_ASSETS.map(coinbaseProductId),
};
