import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { CircuitBreakerIndicator, useBreaker } from '@/entities/breaker';
import { ConfidenceBar, Price, usePriceAggregate } from '@/entities/price-aggregate';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

const ASSET_ACCENT: Record<AssetId, string> = {
  btc: 'bg-brand',
  eth: 'bg-brand-light',
};

function AssetPriceCard({ asset }: { readonly asset: AssetId }): JSX.Element {
  const aggregate = usePriceAggregate(asset);
  const breaker = useBreaker(asset);

  return (
    <Card
      data-slot="price-card"
      data-asset={asset}
      className="relative gap-3 overflow-hidden py-4 pl-5 pr-4"
    >
      <span aria-hidden className={cn('absolute left-0 top-0 h-full w-1', ASSET_ACCENT[asset])} />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.6px] text-muted-foreground">
          {asset.toUpperCase()}
        </span>
        <CircuitBreakerIndicator state={breaker} />
      </div>
      <span className="font-mono text-3xl font-normal leading-9 tracking-tight tabular-nums text-foreground">
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
