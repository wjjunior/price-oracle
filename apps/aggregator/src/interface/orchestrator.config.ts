import type { OrchestratorConfig } from '../application/orchestrator.js';
import type { AssetId, SourceId } from '@price-oracle/contracts/primitives';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];
const SOURCES: readonly SourceId[] = ['binance', 'coinbase', 'mock'];

const AGGREGATION_INTERVAL_MS = 500;

const FRESHNESS_DECAY_MS = 10_000;
const DEGRADED_AFTER_MS = 2_000;
const STALE_AFTER_MS = 5_000;
const HEALTH_HYSTERESIS_STREAK = 3;

const BREAKER_CONFIDENCE_FLOOR = 0.6;
const BREAKER_TRIP_STREAK = 6;
const BREAKER_RECOVERY_WINDOW_MS = 30_000;
const BREAKER_HALF_OPEN_PROBE_STREAK = 4;

const ANOMALY_DRIFT_TOLERANCE = 2;
const ANOMALY_STREAK_LENGTH = 6;

export function buildOrchestratorConfig(): OrchestratorConfig {
  return {
    assets: ASSETS,
    sources: SOURCES,
    aggregationIntervalMs: AGGREGATION_INTERVAL_MS,
    thresholds: {
      freshnessDecayMs: FRESHNESS_DECAY_MS,
      degradedAfterMs: DEGRADED_AFTER_MS,
      staleAfterMs: STALE_AFTER_MS,
      healthHysteresisStreak: HEALTH_HYSTERESIS_STREAK,
    },
    breaker: {
      confidenceFloor: BREAKER_CONFIDENCE_FLOOR,
      tripStreak: BREAKER_TRIP_STREAK,
      recoveryWindowMs: BREAKER_RECOVERY_WINDOW_MS,
      halfOpenProbeStreak: BREAKER_HALF_OPEN_PROBE_STREAK,
    },
    anomaly: {
      driftTolerance: ANOMALY_DRIFT_TOLERANCE,
      streakLength: ANOMALY_STREAK_LENGTH,
    },
  };
}
