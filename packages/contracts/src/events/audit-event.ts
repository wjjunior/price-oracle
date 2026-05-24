/**
 * @file Audit events — the durable record of what the system did.
 *
 * Five discriminated variants, all carrying `type` as the
 * discriminator and `at` (ms) as the wall-clock timestamp. The
 * aggregator emits these for every state transition that an
 * operator might later want to reconstruct:
 *
 *  - `SourceStateChanged`:  a source moved between HEALTHY/DEGRADED/
 *                           STALE for an asset. Driven by the source
 *                           FSM after hysteresis confirmed the move.
 *  - `BreakerStateChanged`: the per-asset breaker transitioned
 *                           between CLOSED / HALF_OPEN / OPEN. The
 *                           `reason` is a human-readable string the
 *                           dashboard surfaces directly.
 *  - `AnomalyDetected`:     a numeric anomaly fired (today: price
 *                           drift between sources). Edge-triggered:
 *                           emitted once on the transition, not on
 *                           every tick the threshold is exceeded.
 *  - `DiagnoseRequested`:   an operator (or a trigger) asked for an
 *                           LLM diagnose. Pairs with…
 *  - `DiagnoseAnswered`:    …the response coming back, with latency
 *                           and optional token count. The pair lets
 *                           the dashboard render "LLM round-trip:
 *                           XXX ms".
 *
 * Two routing destinations from a single event:
 *  - the audit collection in Mongo (the durable record);
 *  - the SSE stream wrapped in an `audit` envelope (the live feed
 *    the dashboard's audit timeline subscribes to).
 *
 * The `build*` helpers exist because TypeScript's discriminated-union
 * narrowing is best when the discriminator is a literal — but
 * remembering to spell `type: 'SourceStateChanged'` everywhere is
 * boilerplate. The helpers take the structural part and prepend the
 * literal from the schema's own `shape.type.value`. Single source of
 * truth for the discriminator string.
 *
 * Mongo writes go through `AuditPort.append()` which is **fail-safe**
 * (see CLAUDE.md operational quirks): a Mongo outage downgrades the
 * audit history but does not stop the aggregate from publishing.
 */
import { z } from 'zod';

import { AssetId, BreakerState, Millis, SourceHealth, SourceId } from '../primitives.js';

/**
 * A source's health changed (after hysteresis confirmation).
 */
export const SourceStateChangedSchema = z.strictObject({
  type: z.literal('SourceStateChanged'),
  asset: AssetId,
  source: SourceId,
  from: SourceHealth,
  to: SourceHealth,
  at: Millis,
});
export type SourceStateChanged = z.infer<typeof SourceStateChangedSchema>;

/**
 * The per-asset circuit breaker moved between CLOSED / HALF_OPEN /
 * OPEN. `reason` is a free-form string ("confidence below floor for
 * 6 ticks", "half-open probe succeeded", ...) that the dashboard
 * shows verbatim — keep it human-readable.
 */
export const BreakerStateChangedSchema = z.strictObject({
  type: z.literal('BreakerStateChanged'),
  asset: AssetId,
  from: BreakerState,
  to: BreakerState,
  reason: z.string().min(1),
  at: Millis,
});
export type BreakerStateChanged = z.infer<typeof BreakerStateChangedSchema>;

/**
 * A numeric anomaly fired. Today the only `metric` is "price-drift"
 * (cross-source disagreement above `ANOMALY_DRIFT_TOLERANCE` for at
 * least `ANOMALY_STREAK_LENGTH` ticks), but the schema is generic so
 * new anomaly types (e.g. "freshness-degradation") can join without
 * a contract change.
 *
 * Edge-triggered: one event per transition into the anomalous state,
 * not one per tick — see PRO-45 and the orchestrator's anomaly
 * detector.
 */
export const AnomalyDetectedSchema = z.strictObject({
  type: z.literal('AnomalyDetected'),
  asset: AssetId,
  source: SourceId,
  metric: z.string().min(1),
  value: z.number(),
  threshold: z.number(),
  at: Millis,
});
export type AnomalyDetected = z.infer<typeof AnomalyDetectedSchema>;

/**
 * An LLM diagnose was requested. `trigger` describes who or what
 * asked — `"operator-manual"`, the rate-limit decorator's dedup
 * key, the test fixture name, etc.
 */
export const DiagnoseRequestedSchema = z.strictObject({
  type: z.literal('DiagnoseRequested'),
  asset: AssetId,
  trigger: z.string().min(1),
  at: Millis,
});
export type DiagnoseRequested = z.infer<typeof DiagnoseRequestedSchema>;

/**
 * The diagnose round-trip completed. `latencyMs` is the wall-clock
 * time from request to response; `tokensUsed` is optional because
 * the deterministic stub adapter doesn't have a token count.
 */
export const DiagnoseAnsweredSchema = z.strictObject({
  type: z.literal('DiagnoseAnswered'),
  asset: AssetId,
  latencyMs: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative().optional(),
  at: Millis,
});
export type DiagnoseAnswered = z.infer<typeof DiagnoseAnsweredSchema>;

/**
 * Discriminated union over every audit-event variant. Parse once at
 * the boundary (incoming from Mongo, or before sending on SSE), then
 * downstream code narrows by `event.type`.
 */
export const AuditEventSchema = z.discriminatedUnion('type', [
  SourceStateChangedSchema,
  BreakerStateChangedSchema,
  AnomalyDetectedSchema,
  DiagnoseRequestedSchema,
  DiagnoseAnsweredSchema,
]);
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/* ------------------------------------------------------------------ *
 * Builder helpers
 *
 * Each helper takes the variant's payload *without* the `type` field
 * and prepends the literal from the schema itself. Two benefits:
 *  1. Single source of truth: the literal string lives only in the
 *     schema; the builder reads `.shape.type.value`, so renaming
 *     the literal is one edit.
 *  2. Compile-time discrimination at call sites: `buildAnomaly...`
 *     returns the narrow `AnomalyDetected` type, not the wider
 *     `AuditEvent`, so the caller's code stays narrowed without an
 *     extra `as` assertion.
 * ------------------------------------------------------------------ */

/**
 * Build a `SourceStateChanged` event without spelling the literal.
 */
export const buildSourceStateChangedEvent = (
  params: Omit<SourceStateChanged, 'type'>,
): SourceStateChanged => ({ type: SourceStateChangedSchema.shape.type.value, ...params });

/**
 * Build a `BreakerStateChanged` event without spelling the literal.
 */
export const buildBreakerStateChangedEvent = (
  params: Omit<BreakerStateChanged, 'type'>,
): BreakerStateChanged => ({ type: BreakerStateChangedSchema.shape.type.value, ...params });

/**
 * Build an `AnomalyDetected` event without spelling the literal.
 */
export const buildAnomalyDetectedEvent = (
  params: Omit<AnomalyDetected, 'type'>,
): AnomalyDetected => ({ type: AnomalyDetectedSchema.shape.type.value, ...params });

/**
 * Build a `DiagnoseRequested` event without spelling the literal.
 */
export const buildDiagnoseRequestedEvent = (
  params: Omit<DiagnoseRequested, 'type'>,
): DiagnoseRequested => ({ type: DiagnoseRequestedSchema.shape.type.value, ...params });

/**
 * Build a `DiagnoseAnswered` event without spelling the literal.
 */
export const buildDiagnoseAnsweredEvent = (
  params: Omit<DiagnoseAnswered, 'type'>,
): DiagnoseAnswered => ({ type: DiagnoseAnsweredSchema.shape.type.value, ...params });
