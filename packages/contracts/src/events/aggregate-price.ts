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
