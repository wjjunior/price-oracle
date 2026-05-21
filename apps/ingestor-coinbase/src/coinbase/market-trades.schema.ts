import { z } from 'zod';

const FiniteNumericString = z
  .string()
  .refine((v) => v.trim() !== '' && Number.isFinite(Number(v)), {
    message: 'must be a non-empty string that parses as a finite number',
  });

export const TradeSideSchema = z.enum(['BUY', 'SELL']);

export const TradeSchema = z.object({
  trade_id: z.string().min(1),
  product_id: z.string().min(1),
  price: FiniteNumericString,
  size: FiniteNumericString,
  side: TradeSideSchema,
  time: z.iso.datetime(),
});
export type Trade = z.infer<typeof TradeSchema>;

export const MarketTradesEventSchema = z.object({
  type: z.enum(['snapshot', 'update']),
  trades: z.array(z.unknown()),
});

export const MarketTradesFrameSchema = z.object({
  channel: z.literal('market_trades'),
  timestamp: z.iso.datetime(),
  sequence_num: z.number().int().nonnegative(),
  events: z.array(MarketTradesEventSchema),
});
export type MarketTradesFrame = z.infer<typeof MarketTradesFrameSchema>;
