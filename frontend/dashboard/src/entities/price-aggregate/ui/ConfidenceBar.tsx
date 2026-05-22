import { confidenceLevel } from '../model/severity.js';

import type { ConfidenceLevel } from '@/shared/lib/format';
import type { Confidence } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { cn } from '@/shared/lib/utils';

const FILL_TONE: Record<ConfidenceLevel, string> = {
  HIGH: 'bg-healthy shadow-[0_0_8px_var(--healthy)]',
  DEGRADED: 'bg-degraded shadow-[0_0_8px_var(--degraded)]',
  UNAVAILABLE: 'bg-stale shadow-[0_0_8px_var(--stale)]',
};

export function ConfidenceBar({
  confidence,
}: {
  readonly confidence: Confidence | null;
}): JSX.Element {
  const value = confidence ?? 0;
  const level = confidenceLevel(value);
  const percent = Math.round(value * 100);

  return (
    <div data-slot="confidence-bar" className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Confidence</span>
        <span data-slot="confidence-value" className="font-medium tabular-nums text-foreground">
          {confidence === null ? '—' : `${percent}%`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-slot="confidence-fill"
          data-level={level}
          className={cn('h-full rounded-full transition-[width] duration-500', FILL_TONE[level])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
