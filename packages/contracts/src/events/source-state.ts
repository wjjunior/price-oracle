/**
 * @file `SourceState` — the aggregator's projection of one source.
 *
 * This is *the aggregator's* view of one source for one asset, not
 * anything the source itself publishes. The aggregator maintains a
 * `Map<AssetId, Map<SourceId, SourceState>>` internally and emits
 * snapshots of it via the SSE `source-health` envelope so the
 * dashboard can render the per-source pills (HEALTHY / DEGRADED /
 * STALE / OFFLINE).
 *
 * The state encodes two things:
 *
 *  1. Last observed values: `lastTickAt`, `lastPrice` — both
 *     nullable because a source might be configured but never have
 *     published yet (cold start), and we want to render a UI state
 *     for "waiting" rather than showing stale defaults.
 *
 *  2. Hysteresis machinery: `pendingHealth` + `pendingStreak`. These
 *     are the bookkeeping that prevents health flapping. A source
 *     does not flip to a worse health until it has been observably
 *     worse for `HEALTH_HYSTERESIS_STREAK` consecutive aggregation
 *     ticks; same on the recovery direction. See the source FSM in
 *     `apps/aggregator/src/domain/source-state/`.
 *
 * The fact that we ship this projection over SSE (instead of just
 * health summary text) is what lets the dashboard explain *why* a
 * source is in a given state — "last seen 8s ago" comes from
 * `lastTickAt`, the operator can see whether the source is mid-
 * transition through `pendingStreak`.
 */
import { z } from 'zod';

import { AssetId, Millis, Price, SourceHealth, SourceId } from '../primitives.js';

export const SourceStateSchema = z.strictObject({
  asset: AssetId,
  source: SourceId,
  health: SourceHealth,
  lastTickAt: Millis.nullable(),
  lastPrice: Price.nullable(),
  pendingHealth: SourceHealth.nullable(),
  pendingStreak: z.number().int().nonnegative(),
});
export type SourceState = z.infer<typeof SourceStateSchema>;
