import { z } from 'zod';

export const TradeSideSchema = z.enum(['buy', 'sell']);

export const KrakenTradeSchema = z.object({
  symbol: z.string().min(1),
  side: TradeSideSchema,
  price: z.number().positive(),
  qty: z.number().nonnegative(),
  trade_id: z.number().int().nonnegative(),
  timestamp: z.iso.datetime({ offset: true }),
});
export type KrakenTrade = z.infer<typeof KrakenTradeSchema>;

export const TradeFrameSchema = z.object({
  channel: z.literal('trade'),
  type: z.enum(['snapshot', 'update']),
  data: z.array(z.unknown()),
});
export type TradeFrame = z.infer<typeof TradeFrameSchema>;
