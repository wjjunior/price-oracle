import { z } from 'zod';

const FiniteNumericString = z.string().refine((v) => Number.isFinite(Number(v)), {
  message: 'must parse as a finite number',
});

export const BinanceTradeEventSchema = z.object({
  e: z.literal('trade'),
  E: z.number().int(),
  s: z.string().min(1),
  t: z.number().int(),
  p: FiniteNumericString,
  q: FiniteNumericString,
  T: z.number().int(),
  m: z.boolean(),
});
export type BinanceTradeEvent = z.infer<typeof BinanceTradeEventSchema>;

export const BinanceCombinedTradeEnvelopeSchema = z.object({
  stream: z.string().min(1),
  data: BinanceTradeEventSchema,
});
export type BinanceCombinedTradeEnvelope = z.infer<typeof BinanceCombinedTradeEnvelopeSchema>;
