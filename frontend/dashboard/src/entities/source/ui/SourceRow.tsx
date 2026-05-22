import { formatSourceLatency } from '../model/format-latency.js';
import { HEALTH_TONE } from '../model/health-tone.js';

import type { SourceState } from '@price-oracle/contracts/events';
import type { Millis } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { formatCurrency } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';


export function SourceRow({
  state,
  now,
}: {
  readonly state: SourceState;
  readonly now: Millis;
}): JSX.Element {
  return (
    <div data-slot="source-row" className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span data-slot="source-name" className="truncate font-medium">
          {state.source}
        </span>
        <Badge data-slot="source-health" className={HEALTH_TONE[state.health]}>
          {state.health}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 whitespace-nowrap text-xs text-muted-foreground">
        <span data-slot="source-latency" className="tabular-nums">
          {formatSourceLatency(state.lastTickAt, now)}
        </span>
        <span data-slot="source-price" className="tabular-nums text-foreground">
          {state.lastPrice === null ? '—' : formatCurrency(state.lastPrice)}
        </span>
      </div>
    </div>
  );
}
