import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { Badge } from '@/shared/ui/badge';

export function AssetChip({ asset }: { readonly asset: AssetId }): JSX.Element {
  return (
    <Badge data-slot="asset-chip" variant="outline">
      {asset.toUpperCase()}
    </Badge>
  );
}
