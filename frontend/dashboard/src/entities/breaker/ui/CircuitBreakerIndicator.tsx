import { BreakerState } from '@price-oracle/contracts/primitives';
import { ShieldAlertIcon, ShieldCheckIcon, ShieldXIcon, type LucideIcon } from 'lucide-react';

import type { JSX } from 'react';

import { cn } from '@/shared/lib/utils';

type BreakerMeta = {
  readonly Icon: LucideIcon;
  readonly label: string;
  readonly className: string;
  readonly pulse: boolean;
};

const BREAKER_META: Record<BreakerState, BreakerMeta> = {
  [BreakerState.enum.CLOSED]: {
    Icon: ShieldCheckIcon,
    label: 'Live',
    className: 'bg-healthy/15 text-healthy',
    pulse: false,
  },
  [BreakerState.enum.HALF_OPEN]: {
    Icon: ShieldAlertIcon,
    label: 'Recovering',
    className: 'bg-degraded/20 text-degraded-foreground',
    pulse: false,
  },
  [BreakerState.enum.OPEN]: {
    Icon: ShieldXIcon,
    label: 'Suppressed',
    className: 'bg-stale/15 text-stale',
    pulse: true,
  },
};

export function CircuitBreakerIndicator({
  state,
}: {
  readonly state: BreakerState;
}): JSX.Element {
  const meta = BREAKER_META[state];
  return (
    <span
      data-slot="breaker-indicator"
      data-state={state}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        meta.className,
      )}
    >
      <meta.Icon className={cn('size-3.5', meta.pulse && 'animate-pulse')} aria-hidden />
      {meta.label}
    </span>
  );
}
