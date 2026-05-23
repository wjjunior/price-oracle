import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { cn } from '@/shared/lib/utils';

const ASSET_CHIP: Record<AssetId, string> = {
  btc: 'border-brand/50 text-brand',
  eth: 'border-brand-light/50 text-brand-light',
};

export function AssetChip({ asset }: { readonly asset: AssetId }): JSX.Element {
  return (
    <span
      data-slot="asset-chip"
      data-asset={asset}
      className={cn(
        'inline-flex items-center justify-center rounded border bg-transparent px-1.5 font-mono text-[10px] font-medium tracking-wider',
        ASSET_CHIP[asset],
      )}
    >
      {asset.toUpperCase()}
    </span>
  );
}
