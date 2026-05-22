import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { AssetId, Confidence, Millis, Price } from '@price-oracle/contracts/primitives';

export const MAX_TREND_POINTS = 120;

export type TrendPoint = {
  readonly t: Millis;
  readonly price: Price;
  readonly confidence: Confidence;
};

type PriceHistoryState = {
  byAsset: Record<AssetId, TrendPoint[]>;
  push: (asset: AssetId, point: TrendPoint) => void;
};

export const usePriceHistoryStore = create<PriceHistoryState>()(
  subscribeWithSelector((set) => ({
    byAsset: { btc: [], eth: [] },
    push: (asset, point): void =>
      set((state) => {
        const next = [...state.byAsset[asset], point];
        const trimmed =
          next.length > MAX_TREND_POINTS ? next.slice(next.length - MAX_TREND_POINTS) : next;
        return { byAsset: { ...state.byAsset, [asset]: trimmed } };
      }),
  })),
);

export function usePriceHistory(asset: AssetId): TrendPoint[] {
  return usePriceHistoryStore((state) => state.byAsset[asset]);
}
