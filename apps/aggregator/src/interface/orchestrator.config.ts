import { AssetId, SourceId } from '@price-oracle/contracts/primitives';
import { z } from 'zod';

import type { OrchestratorConfig } from '../application/orchestrator.js';

const DEFAULT_ASSETS = 'btc,eth';
const DEFAULT_SOURCES = 'mock';

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const noDuplicates = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

const DUPLICATE_ENTRY_MESSAGE = 'duplicate entries are not allowed';

const assetsSchema = z
  .string()
  .default(DEFAULT_ASSETS)
  .transform(splitCsv)
  .pipe(z.array(AssetId).min(1).refine(noDuplicates, DUPLICATE_ENTRY_MESSAGE));

const sourcesSchema = z
  .string()
  .default(DEFAULT_SOURCES)
  .transform(splitCsv)
  .pipe(z.array(SourceId).min(1).refine(noDuplicates, DUPLICATE_ENTRY_MESSAGE));

const OrchestratorEnvSchema = z.object({
  AGGREGATOR_ASSETS: assetsSchema,
  AGGREGATOR_SOURCES: sourcesSchema,
  AGGREGATION_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  FRESHNESS_DECAY_MS: z.coerce.number().int().positive().default(12_000),
  DEGRADED_AFTER_MS: z.coerce.number().int().positive().default(5_000),
  STALE_AFTER_MS: z.coerce.number().int().positive().default(12_000),
  HEALTH_HYSTERESIS_STREAK: z.coerce.number().int().positive().default(3),
  BREAKER_CONFIDENCE_FLOOR: z.coerce.number().min(0).max(1).default(0.6),
  BREAKER_TRIP_STREAK: z.coerce.number().int().positive().default(6),
  BREAKER_RECOVERY_WINDOW_MS: z.coerce.number().int().positive().default(30_000),
  BREAKER_HALF_OPEN_PROBE_STREAK: z.coerce.number().int().positive().default(4),
  ANOMALY_DRIFT_TOLERANCE: z.coerce.number().nonnegative().default(2),
  ANOMALY_STREAK_LENGTH: z.coerce.number().int().positive().default(6),
});

export function buildOrchestratorConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const parsed = OrchestratorEnvSchema.parse(env);
  return {
    assets: parsed.AGGREGATOR_ASSETS,
    sources: parsed.AGGREGATOR_SOURCES,
    aggregationIntervalMs: parsed.AGGREGATION_INTERVAL_MS,
    thresholds: {
      freshnessDecayMs: parsed.FRESHNESS_DECAY_MS,
      degradedAfterMs: parsed.DEGRADED_AFTER_MS,
      staleAfterMs: parsed.STALE_AFTER_MS,
      healthHysteresisStreak: parsed.HEALTH_HYSTERESIS_STREAK,
    },
    breaker: {
      confidenceFloor: parsed.BREAKER_CONFIDENCE_FLOOR,
      tripStreak: parsed.BREAKER_TRIP_STREAK,
      recoveryWindowMs: parsed.BREAKER_RECOVERY_WINDOW_MS,
      halfOpenProbeStreak: parsed.BREAKER_HALF_OPEN_PROBE_STREAK,
    },
    anomaly: {
      driftTolerance: parsed.ANOMALY_DRIFT_TOLERANCE,
      streakLength: parsed.ANOMALY_STREAK_LENGTH,
    },
  };
}
