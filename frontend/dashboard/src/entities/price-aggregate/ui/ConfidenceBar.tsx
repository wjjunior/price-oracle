import { confidenceLevel } from '../model/severity.js';

import type { ConfidenceLevel } from '@/shared/lib/format';
import type { Confidence } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { cn } from '@/shared/lib/utils';

const FILL_TONE: Record<ConfidenceLevel, string> = {
  HIGH: 'bg-brand-light shadow-[0_0_12px_color-mix(in_oklab,var(--brand-light),transparent_40%)]',
  DEGRADED:
    'bg-degraded shadow-[0_0_10px_color-mix(in_oklab,var(--degraded),transparent_55%)]',
  UNAVAILABLE: 'bg-stale shadow-[0_0_10px_color-mix(in_oklab,var(--stale),transparent_55%)]',
};

export function ConfidenceBar({
  confidence,
}: {
  readonly confidence: Confidence | null;
}): JSX.Element {
  const value = confidence ?? 0;
  const level = confidenceLevel(value);
  const percent = (value * 100).toFixed(2);

  return (
    <div data-slot="confidence-bar" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-normal uppercase tracking-[0.3px] text-muted-foreground">
          Confidence
        </span>
        <span
          data-slot="confidence-value"
          className="font-mono text-sm tabular-nums text-foreground"
        >
          {confidence === null ? '—' : `${percent}%`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-slot="confidence-fill"
          data-level={level}
          className={cn('h-full rounded-full transition-[width] duration-500', FILL_TONE[level])}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
