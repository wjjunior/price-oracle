import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_TREND_POINTS, usePriceHistoryStore, type TrendPoint } from './history-store.js';

const point = (t: number): TrendPoint => ({ t, price: 70_000 + t, confidence: 0.9 });

describe('price history store', () => {
  beforeEach(() => usePriceHistoryStore.setState({ byAsset: { btc: [], eth: [] } }));

  it('should append points per asset without touching the other asset', () => {
    usePriceHistoryStore.getState().push('btc', point(1));
    usePriceHistoryStore.getState().push('btc', point(2));

    expect(usePriceHistoryStore.getState().byAsset.btc.map((p) => p.t)).toEqual([1, 2]);
    expect(usePriceHistoryStore.getState().byAsset.eth).toEqual([]);
  });

  it('should cap the buffer at MAX_TREND_POINTS, keeping the most recent points', () => {
    for (let i = 0; i < MAX_TREND_POINTS + 10; i += 1) {
      usePriceHistoryStore.getState().push('eth', point(i));
    }

    const eth = usePriceHistoryStore.getState().byAsset.eth;
    expect(eth).toHaveLength(MAX_TREND_POINTS);
    expect(eth[0]?.t).toBe(10);
    expect(eth.at(-1)?.t).toBe(MAX_TREND_POINTS + 9);
  });
});
