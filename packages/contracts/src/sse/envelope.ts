/**
 * @file SSE envelope — the wire format on `GET /api/stream`.
 *
 * The dashboard opens one SSE connection to the aggregator and
 * receives a multiplexed stream of four envelope variants. This
 * single-stream design is intentional:
 *  - one connection per operator, not four;
 *  - one reconnect / one auth boundary;
 *  - the dashboard's bootstrap can subscribe once and route to the
 *    right Zustand store by `envelope.type` (see the FSD `entities`
 *    layer in the dashboard).
 *
 * The discriminator is `type`, the same shape as audit events. The
 * dashboard narrows on it inside the SSE handler:
 *
 *     switch (envelope.type) {
 *       case 'aggregate':     priceAggregateStore.set(envelope.asset, envelope.data);
 *       case 'source-health': sourceStore.set(envelope.asset, envelope.data);
 *       case 'breaker-state': sourceStore.setBreaker(envelope.asset, envelope.data);
 *       case 'audit':         auditEventStore.append(envelope.data);
 *     }
 *
 * Every variant carries `correlationId` so the dashboard's audit
 * timeline can attribute lines back to the originating tick. The
 * `audit` variant does not include `asset` at the envelope level
 * because the asset (when relevant) is already inside the audit
 * event itself — and `DiagnoseRequested` / `DiagnoseAnswered` are
 * naturally per-asset while a future global audit type (e.g.
 * "system-startup") would not need one.
 */
import { z } from 'zod';

import { AggregatePriceSchema, AuditEventSchema, SourceStateSchema } from '../events/index.js';
import { AssetId, BreakerState, CorrelationId } from '../primitives.js';

export const SseEnvelopeSchema = z.discriminatedUnion('type', [
  // Aggregate produced this tick. The dashboard's price-trend widget
  // appends `data.price` and `data.confidence` to its history buffer.
  z.strictObject({
    type: z.literal('aggregate'),
    asset: AssetId,
    data: AggregatePriceSchema,
    correlationId: CorrelationId,
  }),
  // Per-source projection snapshot. Emitted after every aggregation
  // pulse so the dashboard's "last seen Ns ago" pills tick smoothly
  // (PRO-51 made this stream every tick rather than only on transitions).
  z.strictObject({
    type: z.literal('source-health'),
    asset: AssetId,
    data: SourceStateSchema,
    correlationId: CorrelationId,
  }),
  // Per-asset breaker state. Independent envelope (rather than a
  // field inside `aggregate`) so the dashboard can color the breaker
  // pill even on ticks where no aggregate was produced.
  z.strictObject({
    type: z.literal('breaker-state'),
    asset: AssetId,
    data: BreakerState,
    correlationId: CorrelationId,
  }),
  // Audit append — fans every audit event to the dashboard timeline
  // as it's written. `data` is the full audit-event discriminated
  // union, so it self-describes which kind of transition fired.
  z.strictObject({
    type: z.literal('audit'),
    data: AuditEventSchema,
    correlationId: CorrelationId,
  }),
]);
export type SseEnvelope = z.infer<typeof SseEnvelopeSchema>;
