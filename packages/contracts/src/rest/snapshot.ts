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
