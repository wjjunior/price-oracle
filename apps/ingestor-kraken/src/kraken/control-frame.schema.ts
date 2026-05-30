import { z } from 'zod';

export const MethodAckSchema = z.object({
  method: z.string().min(1),
  success: z.boolean(),
});
export type MethodAck = z.infer<typeof MethodAckSchema>;

export const ControlChannelFrameSchema = z.object({
  channel: z.enum(['heartbeat', 'status']),
});
export type ControlChannelFrame = z.infer<typeof ControlChannelFrameSchema>;
