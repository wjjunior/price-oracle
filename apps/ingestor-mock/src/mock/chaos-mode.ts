import type { Millis, Price } from '@price-oracle/contracts/primitives';

export const ChaosMode = {
  HEALTHY: 'healthy',
  DISCONNECTED: 'disconnected',
  STALE: 'stale',
  MALFORMED: 'malformed',
} as const;

export type ChaosMode = (typeof ChaosMode)[keyof typeof ChaosMode];

export type ChaosState =
  | { readonly mode: typeof ChaosMode.HEALTHY; readonly since: Millis }
  | { readonly mode: typeof ChaosMode.DISCONNECTED; readonly since: Millis }
  | {
      readonly mode: typeof ChaosMode.STALE;
      readonly since: Millis;
      readonly frozenPrice: Price;
      readonly frozenSourceTimestamp: Millis;
    }
  | { readonly mode: typeof ChaosMode.MALFORMED; readonly since: Millis };
