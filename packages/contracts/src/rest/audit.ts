/**
 * @file Response schema for `GET /api/audit[?asset=<asset>&limit=N]`.
 *
 * Returns recent audit events sorted newest-first. The dashboard's
 * audit timeline calls this on hydration, then complements it with
 * live `audit` SSE envelopes.
 *
 * Query params are optional (handled by the controller pipes):
 *  - `asset`: filter by asset; omitted = all assets interleaved.
 *  - `limit`: capped server-side (see `AuditLimitPipe`); the default
 *    is enough for the dashboard's "recent" view without paginating.
 *
 * The wrapping `events` field (rather than returning a raw array)
 * keeps room for paging metadata if the dashboard ever needs to
 * scroll back further — adding `nextCursor` later would not require
 * a contract break, just a new optional field.
 */
import { z } from 'zod';

import { AuditEventSchema } from '../events/index.js';

export const GetAuditResponseSchema = z.strictObject({
  events: z.array(AuditEventSchema),
});
export type GetAuditResponse = z.infer<typeof GetAuditResponseSchema>;
