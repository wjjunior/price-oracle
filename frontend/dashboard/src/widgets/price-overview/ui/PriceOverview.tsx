import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { CircuitBreakerIndicator, useBreaker } from '@/entities/breaker';
import { ConfidenceBar, Price, usePriceAggregate } from '@/entities/price-aggregate';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

function AssetPriceCard({ asset }: { readonly asset: AssetId }): JSX.Element {
  const aggregate = usePriceAggregate(asset);
  const breaker = useBreaker(asset);

  return (
    <Card
      data-slot="price-card"
      data-asset={asset}
      className="gap-4 border-l-4 border-l-brand p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {asset}
        </span>
        <CircuitBreakerIndicator state={breaker} />
      </div>
      <span className="text-3xl font-semibold tabular-nums">
        <Price aggregate={aggregate} />
      </span>
      <ConfidenceBar confidence={aggregate?.confidence ?? null} />
    </Card>
  );
}

export function PriceOverview(): JSX.Element {
  return (
    <section data-slot="price-overview" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {ASSETS.map((asset) => (
        <AssetPriceCard key={asset} asset={asset} />
      ))}
    </section>
  );
}
