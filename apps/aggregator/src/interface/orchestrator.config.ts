/**
 * @file Env-var schema for the orchestrator's *business tuning*.
 *
 * **Split from `config/env.schema.ts` on purpose.** That file owns the
 * process-level wiring (Mongo URL, NATS URL, HTTP port, Anthropic
 * API key). This file owns everything an operator might reasonably
 * tune in production: the closed set of assets/sources, the pulse
 * cadence, the source-FSM thresholds, the breaker streaks and
 * recovery window, the anomaly detector's drift tolerance.
 *
 * **CLAUDE.md rule 11** — `process.env` only in config modules. This
 * is one of the two such modules in the aggregator; both are
 * called from `app.module.ts` via DI factories.
 *
 * **The csv-list pattern**. `AGGREGATOR_ASSETS` and `AGGREGATOR_SOURCES`
 * are comma-separated strings (env vars are strings). The
 * `splitCsv` + `pipe(z.array(...))` shape lets Zod do the parsing in
 * one place — trim, drop empty, validate each item against the
 * enum, refuse duplicates. The `noDuplicates` refine matters: the
 * orchestrator builds a `Map<SourceId, ...>` per asset, and a
 * duplicated source in the list would silently halve coverage.
 *
 * **Default tuning rationale (from CLAUDE.md operational quirks:
 * "Confidence formula constants come from sensitivity analysis").**
 *
 *  - `AGGREGATION_INTERVAL_MS = 500`: the canonical pulse cadence.
 *    Short enough that dashboard feels live, long enough that
 *    JS-event-loop work between pulses is negligible.
 *  - `FRESHNESS_DECAY_MS = 12_000`: 12s half-life-ish. A 12s gap
 *    between ticks decays freshness to ~0 — past this, a source is
 *    STALE anyway.
 *  - `DEGRADED_AFTER_MS = 5_000`, `STALE_AFTER_MS = 12_000`: 5s →
 *    DEGRADED, 12s → STALE. Picked so the source FSM has a clear
 *    middle band where the source still contributes (with reduced
 *    weight) but the operator sees the warning.
 *  - `HEALTH_HYSTERESIS_STREAK = 3`: three consecutive observations
 *    required to commit a health change. Absorbs single-tick
 *    jitter at a band boundary.
 *  - `BREAKER_CONFIDENCE_FLOOR` defaults to the contract's pinned
 *    constant (`BREAKER_CONFIDENCE_FLOOR_DEFAULT`). That value lives
 *    in `@price-oracle/contracts/aggregation` so dashboard and
 *    backend agree on "what is suppressed".
 *  - `BREAKER_TRIP_STREAK = 6`, `BREAKER_HALF_OPEN_PROBE_STREAK = 4`:
 *    asymmetric — closing requires fewer probes than tripping
 *    requires bad pulses, but the trip side is also gating on the
 *    floor being breached. Both are pulse-counted, so at 500ms cadence
 *    `6` = 3s of sustained low confidence to trip; `4` = 2s of
 *    sustained recovery to close.
 *  - `BREAKER_RECOVERY_WINDOW_MS = 30_000`: 30s pause before HALF_OPEN
 *    starts accepting probes. Gives the upstream time to actually
 *    heal — no point in probing too early.
 *  - `ANOMALY_DRIFT_TOLERANCE = 2` (%): 2% deviation from the
 *    aggregate counts as drifting. At BTC ≈ $76k, this is ±$1,520 —
 *    far above legitimate cross-exchange spread.
 *  - `ANOMALY_STREAK_LENGTH = 6`: 3s of sustained drift before the
 *    edge-trigger fires.
 *
 * **`.refine` cross-field invariants.** Two checks enforce orderings
 * that the FSM relies on:
 *
 *  - `DEGRADED_AFTER_MS <= STALE_AFTER_MS`: degraded band must come
 *    before stale band.
 *  - `STALE_AFTER_MS <= FRESHNESS_DECAY_MS`: a DEGRADED source must
 *    still have positive freshness; if `staleAfter > decay`, the
 *    DEGRADED band would map to zero weight and the source would
 *    contribute nothing despite still classifying as DEGRADED.
 *
 * Both checks run at boot — misconfigured environments fail loudly
 * with a Zod error message instead of subtly broken FSM semantics.
 *
 * Cross-references:
 *  - `config/env.schema.ts`: the sibling config file for process
 *    wiring.
 *  - `application/orchestrator.ts`: the consumer of `OrchestratorConfig`.
 *  - `@price-oracle/contracts/aggregation`: where
 *    `BREAKER_CONFIDENCE_FLOOR_DEFAULT` lives.
 *  - CLAUDE.md operational quirks → "Confidence formula constants
 *    come from sensitivity analysis."
 */
import { BREAKER_CONFIDENCE_FLOOR_DEFAULT } from '@price-oracle/contracts/aggregation';
import { AssetId, SourceId } from '@price-oracle/contracts/primitives';
import { z } from 'zod';

import type { OrchestratorConfig } from '../application/orchestrator.js';

/**
 * Comma-separated list of assets the aggregator listens for.
 * Default `btc,eth` matches the closed `AssetId` enum.
 */
const DEFAULT_ASSETS = 'btc,eth';
/**
 * Comma-separated list of sources. Default `mock` matches the
 * "runs end-to-end without secrets" stance — the mock ingestor
 * always runs in dev. Production sets this to `binance,coinbase` (or
 * the appropriate combination) via env var.
 */
const DEFAULT_SOURCES = 'mock';

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const noDuplicates = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

const DUPLICATE_ENTRY_MESSAGE = 'duplicate entries are not allowed';

/**
 * Assets CSV → array of `AssetId`. The `.transform` runs after the
 * default, so a missing env var resolves to `splitCsv(DEFAULT_ASSETS)`.
 * The `.pipe(...)` then validates each element against the enum and
 * rejects duplicates and empties.
 */
const assetsSchema = z
  .string()
  .default(DEFAULT_ASSETS)
  .transform(splitCsv)
  .pipe(z.array(AssetId).min(1).refine(noDuplicates, DUPLICATE_ENTRY_MESSAGE));

/**
 * Sources CSV → array of `SourceId`. Same shape as `assetsSchema`.
 */
const sourcesSchema = z
  .string()
  .default(DEFAULT_SOURCES)
  .transform(splitCsv)
  .pipe(z.array(SourceId).min(1).refine(noDuplicates, DUPLICATE_ENTRY_MESSAGE));

/**
 * The orchestrator's env schema. Every numeric field uses
 * `z.coerce.number()` because env vars arrive as strings; the
 * subsequent `.int().positive()` chain validates the coerced value.
 */
const OrchestratorEnvSchema = z.object({
  AGGREGATOR_ASSETS: assetsSchema,
  AGGREGATOR_SOURCES: sourcesSchema,
  AGGREGATION_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  FRESHNESS_DECAY_MS: z.coerce.number().int().positive().default(12_000),
  DEGRADED_AFTER_MS: z.coerce.number().int().positive().default(5_000),
  STALE_AFTER_MS: z.coerce.number().int().positive().default(12_000),
  HEALTH_HYSTERESIS_STREAK: z.coerce.number().int().positive().default(3),
  BREAKER_CONFIDENCE_FLOOR: z.coerce.number().min(0).max(1).default(BREAKER_CONFIDENCE_FLOOR_DEFAULT),
  BREAKER_TRIP_STREAK: z.coerce.number().int().positive().default(6),
  BREAKER_RECOVERY_WINDOW_MS: z.coerce.number().int().positive().default(30_000),
  BREAKER_HALF_OPEN_PROBE_STREAK: z.coerce.number().int().positive().default(4),
  ANOMALY_DRIFT_TOLERANCE: z.coerce.number().nonnegative().default(2),
  ANOMALY_STREAK_LENGTH: z.coerce.number().int().positive().default(6),
})
  // Cross-field check: bands must be ordered correctly.
  .refine((v) => v.DEGRADED_AFTER_MS <= v.STALE_AFTER_MS, {
    error: 'DEGRADED_AFTER_MS must be <= STALE_AFTER_MS',
    path: ['DEGRADED_AFTER_MS'],
  })
  // Cross-field check: a DEGRADED source must still have positive
  // freshness, otherwise the FSM's "still contributing" property
  // breaks.
  .refine((v) => v.STALE_AFTER_MS <= v.FRESHNESS_DECAY_MS, {
    error: 'STALE_AFTER_MS must be <= FRESHNESS_DECAY_MS so a source never reads DEGRADED with zero freshness',
    path: ['STALE_AFTER_MS'],
  });

/**
 * Parse env into a typed `OrchestratorConfig`. Called once at boot
 * from `app.module.ts`. Throws on invalid input — bootstrap catches
 * and exits with a structured `bootstrap.failed` log (`main.ts`).
 *
 * @param env A `process.env`-shaped object. Defaults to `process.env`;
 *            the parameter exists so tests can drive arbitrary
 *            env shapes through the function.
 */
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
