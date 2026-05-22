import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';

type PriceAggregateState = {
  byAsset: Record<AssetId, AggregatePrice | null>;
  setAggregate: (asset: AssetId, aggregate: AggregatePrice | null) => void;
};

export const usePriceAggregateStore = create<PriceAggregateState>()(
  subscribeWithSelector((set) => ({
    byAsset: { btc: null, eth: null },
    setAggregate: (asset, aggregate): void =>
      set((state) => ({ byAsset: { ...state.byAsset, [asset]: aggregate } })),
  })),
);

export function usePriceAggregate(asset: AssetId): AggregatePrice | null {
  return usePriceAggregateStore((state) => state.byAsset[asset]);
}
