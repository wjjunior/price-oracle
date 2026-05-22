import { useState, type JSX } from 'react';

import type { AssetId } from '@price-oracle/contracts/primitives';

import { useRequestDiagnose } from '@/features/request-diagnose';
import { Button } from '@/shared/ui/button';
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

  const loading = view.state === 'loading';

  return (
    <div data-slot="diagnose-panel" className="flex flex-col gap-3">
      <div data-slot="diagnose-asset" className="flex gap-1">
        {ASSETS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === asset ? 'default' : 'outline'}
            aria-pressed={option === asset}
            disabled={loading}
            onClick={() => selectAsset(option)}
          >
            {option.toUpperCase()}
          </Button>
        ))}
      </div>
      <DiagnoseCard {...view} onRequest={() => request(asset)} />
    </div>
  );
}
