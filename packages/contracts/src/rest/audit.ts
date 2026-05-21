import { z } from 'zod';

import { AuditEventSchema } from '../events/index.js';

export const GetAuditResponseSchema = z.strictObject({
  events: z.array(AuditEventSchema),
});
export type GetAuditResponse = z.infer<typeof GetAuditResponseSchema>;
