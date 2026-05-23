import { priceSeverity } from '../model/severity.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { JSX } from 'react';

import { ConfidenceLevel, formatPrice } from '@/shared/lib/format';

const TONE: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.HIGH]: 'text-foreground',
  [ConfidenceLevel.DEGRADED]: 'text-degraded',
  [ConfidenceLevel.UNAVAILABLE]: 'text-muted-foreground',
};

export function Price({ aggregate }: { readonly aggregate: AggregatePrice | null }): JSX.Element {
  const severity = priceSeverity(aggregate);
  return (
    <span data-slot="price" data-severity={severity} className={TONE[severity]}>
      {formatPrice(aggregate?.price ?? null, severity)}
    </span>
  );
}
