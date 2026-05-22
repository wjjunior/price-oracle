import { BreakerState } from '@price-oracle/contracts/primitives';
import { CircleCheckIcon, CircleDotIcon, CircleXIcon, type LucideIcon } from 'lucide-react';

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
    Icon: CircleCheckIcon,
    label: 'CLOSED',
    className: 'bg-brand-badge-bg border-brand/50 text-brand',
    pulse: false,
  },
  [BreakerState.enum.HALF_OPEN]: {
    Icon: CircleDotIcon,
    label: 'HALF-OPEN',
    className: 'bg-degraded/15 border-degraded/50 text-degraded',
    pulse: false,
  },
  [BreakerState.enum.OPEN]: {
    Icon: CircleXIcon,
    label: 'OPEN',
    className: 'bg-stale/10 border-stale/50 text-stale',
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
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tracking-wider',
        meta.className,
      )}
    >
      <meta.Icon className={cn('size-3', meta.pulse && 'animate-pulse')} aria-hidden />
      {meta.label}
    </span>
  );
}
