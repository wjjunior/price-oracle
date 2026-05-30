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
    // No snapshot: it replays historical trades that, stamped receivedAt=now,
    // would mask staleness and re-flood on every reconnect. Live trades on
    // BTC/ETH arrive well within the first-tick budget without it.
    snapshot: false,
  },
};
