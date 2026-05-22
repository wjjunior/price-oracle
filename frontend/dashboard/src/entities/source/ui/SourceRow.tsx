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
    <div data-slot="source-row" className="flex items-center gap-3">
      <span data-slot="source-name" className="font-medium">
        {state.source}
      </span>
      <Badge data-slot="source-health" className={HEALTH_TONE[state.health]}>
        {state.health}
      </Badge>
      <span data-slot="source-latency" className="text-muted-foreground tabular-nums">
        {formatSourceLatency(state.lastTickAt, now)}
      </span>
      <span data-slot="source-price" className="tabular-nums">
        {state.lastPrice === null ? '—' : formatCurrency(state.lastPrice)}
      </span>
    </div>
  );
}
