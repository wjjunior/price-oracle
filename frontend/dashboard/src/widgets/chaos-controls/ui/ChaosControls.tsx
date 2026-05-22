import { BugIcon, RotateCcwIcon, SnowflakeIcon, UnplugIcon, type LucideIcon } from 'lucide-react';

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
  readonly variant: 'destructive' | 'outline' | 'secondary';
};

const SCENARIO_META: Record<ChaosScenario, ScenarioMeta> = {
  disconnect: {
    Icon: UnplugIcon,
    title: 'Stop publishing — the source ages to STALE and drops out of coverage.',
    variant: 'destructive',
  },
  stale: {
    Icon: SnowflakeIcon,
    title: 'Freeze the price but keep publishing — the source stays HEALTHY and triggers an anomaly.',
    variant: 'outline',
  },
  malformed: {
    Icon: BugIcon,
    title: 'Publish invalid payloads — dropped at the validation boundary; the source ages to STALE.',
    variant: 'destructive',
  },
  reset: {
    Icon: RotateCcwIcon,
    title: 'Restore the source to healthy.',
    variant: 'secondary',
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
    <Card data-slot="chaos-controls" className="gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Chaos — mock source</span>
          <span className="text-xs text-muted-foreground">Inject failures (dev only)</span>
        </div>
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
        <div
          key={asset}
          data-slot="chaos-asset"
          data-asset={asset}
          className="flex flex-col gap-1.5 border-t border-border pt-2"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {asset}
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {CHAOS_SCENARIOS.map((scenario) => {
              const meta = SCENARIO_META[scenario];
              return (
                <Button
                  key={scenario}
                  size="sm"
                  variant={meta.variant}
                  title={meta.title}
                  className="justify-start gap-1.5"
                  onClick={() => onAction(asset, scenario)}
                  disabled={pending.has(chaosActionKey(asset, scenario))}
                >
                  <meta.Icon className="size-3.5" aria-hidden />
                  <span className="capitalize">{scenario}</span>
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </Card>
  );
}
