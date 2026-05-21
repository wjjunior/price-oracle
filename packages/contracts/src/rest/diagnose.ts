import { z } from 'zod';

import { AssetId, Millis } from '../primitives.js';

export const PostDiagnoseRequestSchema = z.strictObject({
  trigger: z.string().min(1).optional(),
});
export type PostDiagnoseRequest = z.infer<typeof PostDiagnoseRequestSchema>;

export const PostDiagnoseResponseSchema = z.strictObject({
  asset: AssetId,
  markdown: z.string().min(1),
  latencyMs: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative().optional(),
  generatedAt: Millis,
});
export type PostDiagnoseResponse = z.infer<typeof PostDiagnoseResponseSchema>;
