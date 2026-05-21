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
