import { ActivityIcon, AlertTriangleIcon, XCircleIcon, type LucideIcon } from 'lucide-react';

import { formatSourceLatency } from '../model/format-latency.js';

import type { SourceState } from '@price-oracle/contracts/events';
import type { Millis, SourceHealth } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { formatCurrency } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

type HealthMeta = {
  readonly Icon: LucideIcon;
  readonly className: string;
};

const HEALTH_META: Record<SourceHealth, HealthMeta> = {
  HEALTHY: {
    Icon: ActivityIcon,
    className: 'bg-brand-badge-bg border-brand/50 text-brand',
  },
  DEGRADED: {
    Icon: AlertTriangleIcon,
    className: 'bg-degraded/15 border-degraded/50 text-degraded',
  },
  STALE: {
    Icon: XCircleIcon,
    className: 'bg-stale/10 border-stale/50 text-stale',
  },
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
    <div
      data-slot="source-row"
      className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2 py-1.5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span data-slot="source-name" className="truncate font-mono text-sm text-foreground">
          {state.source}
        </span>
        <span
          data-slot="source-latency"
          className="text-[10px] tabular-nums text-muted-foreground"
        >
          {formatSourceLatency(state.lastTickAt, now)}
        </span>
      </div>
      <span
        data-slot="source-health"
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider',
          meta.className,
        )}
      >
        <meta.Icon className="size-3" aria-hidden />
        {state.health}
      </span>
      <span
        data-slot="source-price"
        className="w-24 text-right font-mono text-xs tabular-nums text-muted-foreground"
      >
        {state.lastPrice === null ? '—' : formatCurrency(state.lastPrice)}
      </span>
    </div>
  );
}
