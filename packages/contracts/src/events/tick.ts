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
