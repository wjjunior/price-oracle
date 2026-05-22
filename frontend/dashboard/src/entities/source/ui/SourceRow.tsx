import { ActivityIcon, AlertTriangleIcon, XCircleIcon, type LucideIcon } from 'lucide-react';

import { formatSourceLatency } from '../model/format-latency.js';

import type { SourceState } from '@price-oracle/contracts/events';
import type { Millis, SourceHealth } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { formatCurrency } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

type HealthMeta = {
  readonly Icon: LucideIcon;
  readonly tone: string;
  readonly pulse: boolean;
};

const HEALTH_META: Record<SourceHealth, HealthMeta> = {
  HEALTHY: { Icon: ActivityIcon, tone: 'text-healthy', pulse: true },
  DEGRADED: { Icon: AlertTriangleIcon, tone: 'text-degraded', pulse: false },
  STALE: { Icon: XCircleIcon, tone: 'text-stale', pulse: false },
};

export function SourceRow({
  state,
  now,
}: {
  readonly state: SourceState;
  readonly now: Millis;
}): JSX.Element {
  const meta = HEALTH_META[state.health];
  return (
    <div data-slot="source-row" className="flex items-center justify-between gap-2 py-1">
      <div className="flex min-w-0 items-center gap-2">
        <meta.Icon className={cn('size-4 shrink-0', meta.tone, meta.pulse && 'animate-pulse')} aria-hidden />
        <span data-slot="source-name" className="truncate font-medium capitalize">
          {state.source}
        </span>
        <span data-slot="source-health" className={cn('text-xs font-medium', meta.tone)}>
          {state.health}
        </span>
      </div>
      <div className="flex flex-col items-end whitespace-nowrap">
        <span data-slot="source-price" className="w-24 text-right tabular-nums">
          {state.lastPrice === null ? '—' : formatCurrency(state.lastPrice)}
        </span>
        <span data-slot="source-latency" className="text-xs tabular-nums text-muted-foreground">
          {formatSourceLatency(state.lastTickAt, now)}
        </span>
      </div>
    </div>
  );
}
