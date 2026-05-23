import { useState, type JSX } from 'react';

import type { AssetId } from '@price-oracle/contracts/primitives';

import { usePriceAggregate } from '@/entities/price-aggregate';
import { useRequestDiagnose } from '@/features/request-diagnose';
import { DiagnoseCard } from '@/widgets/diagnose-card';

export function DiagnosePanel(): JSX.Element {
  const [asset, setAsset] = useState<AssetId>('btc');
  const { view, request, reset } = useRequestDiagnose();
  const aggregate = usePriceAggregate(asset);

  const selectAsset = (next: AssetId): void => {
    if (next === asset) return;
    setAsset(next);
    reset();
  };

  return (
    <DiagnoseCard
      {...view}
      asset={asset}
      confidence={aggregate?.confidence ?? null}
      onAssetChange={selectAsset}
      onRequest={() => request(asset)}
    />
  );
}
