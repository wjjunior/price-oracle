import type { BreakerConfig, BreakerState } from './types.js';
import type { Confidence, Millis } from '@price-oracle/contracts/primitives';

export type BreakerInput = {
  readonly confidence: Confidence;
  readonly streak: number;
  readonly openedAt: Millis | null;
};

const BreakerStates = {
  CLOSED: 'CLOSED',
  HALF_OPEN: 'HALF_OPEN',
  OPEN: 'OPEN',
} as const satisfies Record<BreakerState, BreakerState>;

export const transitionBreaker = (
  prev: BreakerState,
  input: BreakerInput,
  now: Millis,
  cfg: BreakerConfig,
): BreakerState => {
  const belowFloor = input.confidence < cfg.confidenceFloor;

  if (prev === BreakerStates.CLOSED) {
    if (belowFloor && input.streak >= cfg.tripStreak) return BreakerStates.OPEN;
    return BreakerStates.CLOSED;
  }

  if (prev === BreakerStates.OPEN) {
    if (input.openedAt !== null && now - input.openedAt >= cfg.recoveryWindowMs) {
      return BreakerStates.HALF_OPEN;
    }
    return BreakerStates.OPEN;
  }

  if (belowFloor) return BreakerStates.OPEN;
  if (input.streak >= cfg.halfOpenProbeStreak) return BreakerStates.CLOSED;
  return BreakerStates.HALF_OPEN;
};
