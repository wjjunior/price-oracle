import {
  CHAOS_SCENARIOS,
  RESET_ALL_KEY,
  chaosActionKey,
  type ChaosScenario,
} from '../model/scenario.js';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';


const ASSETS: readonly AssetId[] = ['btc', 'eth'];

export function ChaosControls({
  onAction,
  onResetAll,
  pending,
}: {
  readonly onAction: (asset: AssetId, scenario: ChaosScenario) => void;
  readonly onResetAll: () => void;
  readonly pending: ReadonlySet<string>;
}): JSX.Element {
  return (
    <Card data-slot="chaos-controls" className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Chaos — mock source</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={onResetAll}
          disabled={pending.has(RESET_ALL_KEY)}
        >
          Reset all
        </Button>
      </div>
      {ASSETS.map((asset) => (
        <div key={asset} data-slot="chaos-asset" data-asset={asset} className="flex flex-wrap items-center gap-2">
          <span className="w-8 text-xs font-medium uppercase text-muted-foreground">{asset}</span>
          {CHAOS_SCENARIOS.map((scenario) => (
            <Button
              key={scenario}
              size="sm"
              variant="outline"
              onClick={() => onAction(asset, scenario)}
              disabled={pending.has(chaosActionKey(asset, scenario))}
            >
              {scenario}
            </Button>
          ))}
        </div>
      ))}
    </Card>
  );
}
