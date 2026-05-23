import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { Confidence } from '@price-oracle/contracts/primitives';

import { ConfidenceLevel } from '@/shared/lib/format';

export const CONFIDENCE_THRESHOLDS = { high: 0.8, degraded: 0.5 } as const;

export function confidenceLevel(confidence: Confidence): ConfidenceLevel {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return ConfidenceLevel.HIGH;
  if (confidence >= CONFIDENCE_THRESHOLDS.degraded) return ConfidenceLevel.DEGRADED;
  return ConfidenceLevel.UNAVAILABLE;
}

export function priceSeverity(aggregate: AggregatePrice | null): ConfidenceLevel {
  if (aggregate === null) return ConfidenceLevel.UNAVAILABLE;
  return confidenceLevel(aggregate.confidence);
}
