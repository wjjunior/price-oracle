import { KRAKEN_ASSETS, krakenSymbol } from './kraken-symbols.js';

export type SubscribeMessage = {
  readonly method: 'subscribe';
  readonly params: {
    readonly channel: 'trade';
    readonly symbol: readonly string[];
    readonly snapshot: boolean;
  };
};

export const TRADE_SUBSCRIBE: SubscribeMessage = {
  method: 'subscribe',
  params: {
    channel: 'trade',
    symbol: KRAKEN_ASSETS.map(krakenSymbol),
    snapshot: true,
  },
};
