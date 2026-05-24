/**
 * @file `AggregatePrice` — the output of one aggregation tick.
 *
 * Produced by the aggregator at every `AGGREGATION_INTERVAL_MS`
 * (default 500ms). Published on `aggregates.<asset>` (see
 * `subjects.ts`). The dashboard renders it as the headline price +
 * confidence indicator + "computed at" timestamp.
 *
 * Fields:
 *  - `asset`:                BTC or ETH (matches the subject suffix).
 *  - `price`:                The weighted median of the contributing
 *                            sources' last prices. The price you
 *                            should act on (with the appropriate
 *                            confidence skepticism).
 *  - `confidence`:           `freshness * agreement * coverage`,
 *                            normalized to `[0, 1]`. See
 *                            `aggregation/confidence.ts`.
 *  - `contributingSources`:  Which sources actually fed into this
 *                            aggregate. Excludes STALE sources and
 *                            anyone without a last-known price. The
 *                            dashboard uses this list to render the
 *                            per-source health pills.
 *  - `computedAt`:           When the aggregator finished the tick.
 *                            Drives the "as of …" label and lets the
 *                            dashboard detect a stalled aggregator.
 *
 * The schema is `strictObject` for the same reason as `Tick`: extra
 * fields would be silent drift between aggregator and consumers, and
 * a strict parse surfaces them immediately.
 */
import { z } from 'zod';

import { AssetId, Confidence, Millis, Price, SourceId } from '../primitives.js';

export const AggregatePriceSchema = z.strictObject({
  asset: AssetId,
  price: Price,
  confidence: Confidence,
  contributingSources: z.array(SourceId),
  computedAt: Millis,
});
export type AggregatePrice = z.infer<typeof AggregatePriceSchema>;
