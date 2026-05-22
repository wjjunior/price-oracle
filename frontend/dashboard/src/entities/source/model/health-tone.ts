import type { SourceHealth } from '@price-oracle/contracts/primitives';

export const HEALTH_TONE: Record<SourceHealth, string> = {
  HEALTHY: 'bg-healthy text-healthy-foreground',
  DEGRADED: 'bg-degraded text-degraded-foreground',
  STALE: 'bg-stale text-stale-foreground',
};
