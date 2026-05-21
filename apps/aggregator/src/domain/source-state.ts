import type { SourceState, Thresholds, Tick } from './types.js';
import type { Millis, SourceHealth } from '@price-oracle/contracts/primitives';


function classifyHealth(lastTickAt: Millis | null, now: Millis, cfg: Thresholds): SourceHealth {
  if (lastTickAt === null) return 'STALE';
  const age = now - lastTickAt;
  if (age <= cfg.degradedAfterMs) return 'HEALTHY';
  if (age <= cfg.staleAfterMs) return 'DEGRADED';
  return 'STALE';
}

export function updateSourceState(
  prev: SourceState,
  tick: Tick | null,
  now: Millis,
  cfg: Thresholds,
): SourceState {
  const lastTickAt = tick !== null ? tick.receivedAt : prev.lastTickAt;
  const lastPrice = tick !== null ? tick.price : prev.lastPrice;
  const candidate = classifyHealth(lastTickAt, now, cfg);

  if (candidate === prev.health) {
    return { ...prev, lastTickAt, lastPrice, pendingHealth: null, pendingStreak: 0 };
  }

  const pendingStreak = prev.pendingHealth === candidate ? prev.pendingStreak + 1 : 1;

  if (pendingStreak >= cfg.healthHysteresisStreak) {
    return {
      ...prev,
      lastTickAt,
      lastPrice,
      health: candidate,
      pendingHealth: null,
      pendingStreak: 0,
    };
  }

  return { ...prev, lastTickAt, lastPrice, pendingHealth: candidate, pendingStreak };
}
