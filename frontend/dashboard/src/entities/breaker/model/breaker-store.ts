import { BreakerState } from '@price-oracle/contracts/primitives';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { AssetId } from '@price-oracle/contracts/primitives';

type BreakerStoreState = {
  byAsset: Record<AssetId, BreakerState>;
  setBreaker: (asset: AssetId, state: BreakerState) => void;
};

export const useBreakerStore = create<BreakerStoreState>()(
  subscribeWithSelector((set) => ({
    byAsset: { btc: BreakerState.enum.CLOSED, eth: BreakerState.enum.CLOSED },
    setBreaker: (asset, state): void =>
      set((prev) => ({ byAsset: { ...prev.byAsset, [asset]: state } })),
  })),
);

export function useBreaker(asset: AssetId): BreakerState {
  return useBreakerStore((state) => state.byAsset[asset]);
}
