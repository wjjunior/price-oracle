/**
 * @file Subpath public surface for `@price-oracle/contracts/events`.
 *
 * Three event families live here:
 *  - `Tick` — one source's observation, the input to the aggregator;
 *  - `AggregatePrice` — the aggregator's published output;
 *  - `SourceState` — the aggregator's per-source projection, fanned
 *    out to the dashboard via SSE;
 *  - the audit-event discriminated union and its build helpers.
 *
 * Importers should depend on this `events` subpath rather than the
 * individual files — moving a schema between files (e.g. splitting
 * out `aggregate-price` into a separate folder later) should not
 * cascade into consumers.
 */
export { TickSchema, type Tick } from './tick.js';
export { AggregatePriceSchema, type AggregatePrice } from './aggregate-price.js';
export { SourceStateSchema, type SourceState } from './source-state.js';
export {
  AuditEventSchema,
  AnomalyDetectedSchema,
  BreakerStateChangedSchema,
  DiagnoseAnsweredSchema,
  DiagnoseRequestedSchema,
  SourceStateChangedSchema,
  buildAnomalyDetectedEvent,
  buildBreakerStateChangedEvent,
  buildDiagnoseAnsweredEvent,
  buildDiagnoseRequestedEvent,
  buildSourceStateChangedEvent,
  type AnomalyDetected,
  type AuditEvent,
  type BreakerStateChanged,
  type DiagnoseAnswered,
  type DiagnoseRequested,
  type SourceStateChanged,
} from './audit-event.js';
