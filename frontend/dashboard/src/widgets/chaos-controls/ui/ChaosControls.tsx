import { AlertCircleIcon, ClockIcon, RotateCcwIcon, WifiOffIcon, type LucideIcon } from 'lucide-react';

import { CHAOS_SCENARIOS, type ChaosScenario } from '../model/scenario.js';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { RESET_ALL_KEY, chaosActionKey } from '@/features/inject-failure';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

type ScenarioMeta = {
  readonly Icon: LucideIcon;
  readonly title: string;
  readonly variant: 'destructive' | 'outline' | 'ghost';
};

const SCENARIO_META: Record<ChaosScenario, ScenarioMeta> = {
  disconnect: {
    Icon: WifiOffIcon,
    title: 'Stop publishing — the source ages to STALE and drops out of coverage.',
    variant: 'destructive',
  },
  stale: {
    Icon: ClockIcon,
    title: 'Freeze the price but keep publishing — the source stays HEALTHY and triggers an anomaly.',
    variant: 'outline',
  },
  malformed: {
    Icon: AlertCircleIcon,
    title: 'Publish invalid payloads — dropped at the validation boundary; the source ages to STALE.',
    variant: 'destructive',
  },
  reset: {
    Icon: RotateCcwIcon,
    title: 'Restore the source to healthy.',
    variant: 'ghost',
  },
};

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
    <Card data-slot="chaos-controls" className="gap-4 py-4 px-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs uppercase tracking-[0.6px] text-muted-foreground">
          Chaos — mock source
        </span>
        <span className="text-[10px] text-muted-foreground">Inject failures (dev only)</span>
      </div>
      <div className="flex flex-col gap-3">
        {ASSETS.map((asset) => (
          <div key={asset} data-slot="chaos-asset" data-asset={asset} className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.25px] text-muted-foreground">
              {asset.toUpperCase()}
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {CHAOS_SCENARIOS.map((scenario) => {
                const meta = SCENARIO_META[scenario];
                return (
                  <Button
                    key={scenario}
                    size="sm"
                    variant={meta.variant}
                    title={meta.title}
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => onAction(asset, scenario)}
                    disabled={pending.has(chaosActionKey(asset, scenario))}
                  >
                    <meta.Icon className="size-3" aria-hidden />
                    <span className="capitalize">{scenario}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-3">
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full gap-1.5 text-[11px]"
          onClick={onResetAll}
          disabled={pending.has(RESET_ALL_KEY)}
        >
          <RotateCcwIcon className="size-3" aria-hidden />
          Reset all
        </Button>
      </div>
    </Card>
  );
}
