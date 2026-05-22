import { priceSeverity } from '../model/severity.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { JSX } from 'react';

import { formatPrice, type ConfidenceLevel } from '@/shared/lib/format';


const TONE: Record<ConfidenceLevel, string> = {
  HIGH: 'text-foreground',
  DEGRADED: 'text-degraded',
  UNAVAILABLE: 'text-muted-foreground',
};

export function Price({ aggregate }: { readonly aggregate: AggregatePrice | null }): JSX.Element {
  const severity = priceSeverity(aggregate);
  return (
    <span data-slot="price" data-severity={severity} className={TONE[severity]}>
      {formatPrice(aggregate?.price ?? null, severity)}
    </span>
  );
}
