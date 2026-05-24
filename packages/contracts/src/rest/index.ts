/**
 * @file Subpath public surface for `@price-oracle/contracts/rest`.
 *
 * Three REST endpoints in the contract surface:
 *  - `GET /api/snapshot` — hydration baseline (`snapshot.ts`).
 *  - `GET /api/audit`    — recent audit events (`audit.ts`).
 *  - `POST /api/diagnose` — LLM-backed narrative explainer
 *                          (`diagnose.ts`).
 *
 * The corresponding controllers live in
 * `apps/aggregator/src/interface/`; the dashboard's `entities/.../api/`
 * loaders import these schemas to validate and type the responses.
 */
export { GetSnapshotResponseSchema, type GetSnapshotResponse } from './snapshot.js';
export { GetAuditResponseSchema, type GetAuditResponse } from './audit.js';
export {
  PostDiagnoseRequestSchema,
  PostDiagnoseResponseSchema,
  type PostDiagnoseRequest,
  type PostDiagnoseResponse,
} from './diagnose.js';
