import { z } from 'zod';

const ErrorEntrySchema = z.object({ id: z.string(), message: z.string() });

export const ErrorFrameSchema = z.object({
  errors: z.tuple([ErrorEntrySchema]).rest(ErrorEntrySchema),
});
export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;
