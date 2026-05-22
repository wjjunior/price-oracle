import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { Price, usePriceAggregate } from '@/entities/price-aggregate';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

function AssetPrice({ asset }: { readonly asset: AssetId }): JSX.Element {
  const aggregate = usePriceAggregate(asset);
  return (
    <Card data-slot="price-card" className="gap-1 p-4">
      <span className="text-xs font-medium uppercase text-muted-foreground">{asset}</span>
      <span className="text-2xl font-semibold tabular-nums">
        <Price aggregate={aggregate} />
      </span>
    </Card>
  );
}

export function PriceOverview(): JSX.Element {
  return (
    <section data-slot="price-overview" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {ASSETS.map((asset) => (
        <AssetPrice key={asset} asset={asset} />
      ))}
    </section>
  );
}
