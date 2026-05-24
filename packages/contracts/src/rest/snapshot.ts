/**
 * @file Response schema for `GET /api/snapshot?asset=<asset>`.
 *
 * The dashboard's hydration call. When the dashboard first loads (or
 * reconnects after an SSE drop), it asks for `/api/snapshot` to
 * rehydrate every visible piece of state, then resumes the SSE
 * stream from a known baseline. Without snapshot, the dashboard
 * would have to wait for the next round of every kind of envelope
 * (`aggregate`, `source-health`, `breaker-state`) before each widget
 * had data, which on the 500ms aggregation cadence still feels
 * choppy.
 *
 * Fields mirror the dashboard's per-asset section: the latest
 * aggregate (nullable on cold start), the full per-source projection,
 * and the breaker state. Audit history is intentionally *not* part
 * of snapshot — it comes from `GET /api/audit` instead, because the
 * snapshot endpoint should be cheap and audit can be paginated /
 * filtered separately.
 *
 * After aggregator restart, the aggregator serves `lastKnownAggregate`
 * (loaded from Mongo audit) here until a fresh tick arrives — see the
 * "Aggregator restart recovers" operational quirk in CLAUDE.md.
 */
import { z } from 'zod';

import { AggregatePriceSchema, SourceStateSchema } from '../events/index.js';
import { AssetId, BreakerState } from '../primitives.js';

export const GetSnapshotResponseSchema = z.strictObject({
  asset: AssetId,
  aggregate: AggregatePriceSchema.nullable(),
  sources: z.array(SourceStateSchema),
  breaker: BreakerState,
});
export type GetSnapshotResponse = z.infer<typeof GetSnapshotResponseSchema>;
