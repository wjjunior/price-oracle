import { z } from 'zod';

import { AggregatePriceSchema, AuditEventSchema, SourceStateSchema } from '../events/index.js';
import { AssetId, BreakerState, CorrelationId } from '../primitives.js';

export const SseEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('aggregate'),
    asset: AssetId,
    data: AggregatePriceSchema,
    correlationId: CorrelationId,
  }),
  z.strictObject({
    type: z.literal('source-health'),
    asset: AssetId,
    data: SourceStateSchema,
    correlationId: CorrelationId,
  }),
  z.strictObject({
    type: z.literal('breaker-state'),
    asset: AssetId,
    data: BreakerState,
    correlationId: CorrelationId,
  }),
  z.strictObject({
    type: z.literal('audit'),
    data: AuditEventSchema,
    correlationId: CorrelationId,
  }),
]);
export type SseEnvelope = z.infer<typeof SseEnvelopeSchema>;
