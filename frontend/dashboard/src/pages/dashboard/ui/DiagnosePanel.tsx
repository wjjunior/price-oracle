import { useState, type JSX } from 'react';

import type { AssetId } from '@price-oracle/contracts/primitives';

import { useRequestDiagnose } from '@/features/request-diagnose';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { DiagnoseCard } from '@/widgets/diagnose-card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

export function DiagnosePanel(): JSX.Element {
  const [asset, setAsset] = useState<AssetId>('btc');
  const { view, request, reset } = useRequestDiagnose();

  const selectAsset = (next: AssetId): void => {
    if (next === asset) return;
    setAsset(next);
    reset();
  };

  const onValueChange = (value: string): void => {
    const next = ASSETS.find((option) => option === value);
    if (next) selectAsset(next);
  };

  const loading = view.state === 'loading';

  return (
    <div data-slot="diagnose-panel" className="flex flex-col gap-3">
      <Tabs value={asset} onValueChange={onValueChange}>
        <TabsList data-slot="diagnose-asset" className="w-full">
          {ASSETS.map((option) => (
            <TabsTrigger key={option} value={option} disabled={loading} className="flex-1">
              {option.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DiagnoseCard {...view} onRequest={() => request(asset)} />
    </div>
  );
}
