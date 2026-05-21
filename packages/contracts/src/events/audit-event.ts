import { z } from 'zod';

import { AssetId, BreakerState, Millis, SourceHealth, SourceId } from '../primitives.js';

export const SourceStateChangedSchema = z.strictObject({
  type: z.literal('SourceStateChanged'),
  asset: AssetId,
  source: SourceId,
  from: SourceHealth,
  to: SourceHealth,
  at: Millis,
});
export type SourceStateChanged = z.infer<typeof SourceStateChangedSchema>;

export const BreakerStateChangedSchema = z.strictObject({
  type: z.literal('BreakerStateChanged'),
  asset: AssetId,
  from: BreakerState,
  to: BreakerState,
  reason: z.string().min(1),
  at: Millis,
});
export type BreakerStateChanged = z.infer<typeof BreakerStateChangedSchema>;

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

export const DiagnoseRequestedSchema = z.strictObject({
  type: z.literal('DiagnoseRequested'),
  asset: AssetId,
  trigger: z.string().min(1),
  at: Millis,
});
export type DiagnoseRequested = z.infer<typeof DiagnoseRequestedSchema>;

export const DiagnoseAnsweredSchema = z.strictObject({
  type: z.literal('DiagnoseAnswered'),
  asset: AssetId,
  latencyMs: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative().optional(),
  at: Millis,
});
export type DiagnoseAnswered = z.infer<typeof DiagnoseAnsweredSchema>;

export const AuditEventSchema = z.discriminatedUnion('type', [
  SourceStateChangedSchema,
  BreakerStateChangedSchema,
  AnomalyDetectedSchema,
  DiagnoseRequestedSchema,
  DiagnoseAnsweredSchema,
]);
export type AuditEvent = z.infer<typeof AuditEventSchema>;
