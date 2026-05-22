import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { SourceState } from '@price-oracle/contracts/events';
import type { AssetId, SourceId } from '@price-oracle/contracts/primitives';

type SourceStoreState = {
  byAsset: Record<AssetId, Partial<Record<SourceId, SourceState>>>;
  setSource: (state: SourceState) => void;
};

export const useSourceStore = create<SourceStoreState>()(
  subscribeWithSelector((set) => ({
    byAsset: { btc: {}, eth: {} },
    setSource: (state): void =>
      set((prev) => ({
        byAsset: {
          ...prev.byAsset,
          [state.asset]: { ...prev.byAsset[state.asset], [state.source]: state },
        },
      })),
  })),
);

export function useSource(asset: AssetId, source: SourceId): SourceState | undefined {
  return useSourceStore((state) => state.byAsset[asset][source]);
}
