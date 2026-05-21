import { z } from 'zod';

import { MarketTradesFrameSchema } from './market-trades.schema.js';

export const SubscriptionsFrameSchema = z.object({
  channel: z.literal('subscriptions'),
  timestamp: z.iso.datetime(),
  sequence_num: z.number().int().nonnegative(),
  events: z.array(z.unknown()),
});

export const FrameSchema = z.discriminatedUnion('channel', [
  MarketTradesFrameSchema,
  SubscriptionsFrameSchema,
]);
export type Frame = z.infer<typeof FrameSchema>;
