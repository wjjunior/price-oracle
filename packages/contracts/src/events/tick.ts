/**
 * @file `Tick` — the smallest event in the system.
 *
 * A Tick is one price observation from one source for one asset, at
 * one moment in time. The ingestors produce ticks; the aggregator
 * consumes them. Everything else (aggregate, confidence, audit) is
 * derived from a stream of ticks.
 *
 * The subject this is published on is `ticks.<asset>.<source>` — see
 * `subjects.ts`. The schema is `strictObject` so extra fields are
 * rejected at the boundary: an adapter that quietly added an extra
 * field would fail Zod parse on the aggregator side, surfacing the
 * drift immediately instead of silently sending unobserved data.
 *
 * Fields:
 *  - `asset`:           BTC or ETH (matches the subject suffix).
 *  - `source`:          binance / coinbase / mock (matches the
 *                       subject suffix; the duplication is on
 *                       purpose — payload is self-describing).
 *  - `price`:           USD value, strictly positive.
 *  - `receivedAt`:      when the *ingestor* observed the price
 *                       (its own clock). Used by the aggregator
 *                       as the freshness anchor.
 *  - `sourceTimestamp`: optional vendor-reported timestamp. Today
 *                       the aggregator does not use this for
 *                       freshness — adapters that have it (Binance
 *                       trade events) include it for diagnostic
 *                       grep, but freshness still tracks
 *                       `receivedAt` because clock skew between
 *                       exchanges and our ingestors has been
 *                       observed.
 */
import { z } from 'zod';

import { AssetId, Millis, Price, SourceId } from '../primitives.js';

export const TickSchema = z.strictObject({
  asset: AssetId,
  source: SourceId,
  price: Price,
  receivedAt: Millis,
  sourceTimestamp: Millis.optional(),
});
export type Tick = z.infer<typeof TickSchema>;
