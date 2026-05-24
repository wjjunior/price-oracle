/**
 * @file Zod schema for the Coinbase Advanced Trade error envelope.
 *
 * Coinbase delivers protocol-level failures (auth issues, malformed
 * subscribe frames, rate-limit refusals, an unknown product id on
 * subscribe, ...) as a JSON frame whose only top-level field is
 * `errors: [...]`. That envelope shape has nothing in common with the
 * channelled data frames in `frame.schema.ts`, so it cannot live in
 * the same discriminated union — `discriminatedUnion` requires a
 * shared discriminator field, and Coinbase chose not to give error
 * frames a `channel`. Instead, `CoinbaseService.handleMessage`
 * speculatively tries `ErrorFrameSchema.safeParse` *first* and falls
 * through to `FrameSchema` only if the error-shape parse fails.
 *
 * This is a Coinbase-specific concern. The Binance ingestor has no
 * analogue: Binance's `<symbol>@trade` stream delivers only trade
 * events — protocol failures surface as WS-level errors or as broken
 * connections, not as in-band JSON. That asymmetry is why this file
 * has no Binance sibling.
 *
 * CLAUDE.md rule 20 maps "rate-limit refusal" and similar recoverable
 * boundary failures to `warn`; the call site in `coinbase.service.ts`
 * logs the first error entry at `warn` and drops the frame.
 */
import { z } from 'zod';

// One entry in the `errors` array. Coinbase documents `id` as a
// short machine-readable error code (e.g. `unknown`, `authentication`)
// and `message` as the operator-readable explanation. We keep both
// because the dashboard log tail shows the message but the audit
// timeline keys off the id.
const ErrorEntrySchema = z.object({ id: z.string(), message: z.string() });

/**
 * Outer error envelope. The `z.tuple([ErrorEntrySchema]).rest(ErrorEntrySchema)`
 * shape encodes "at least one entry, with any number of additional
 * entries" — Coinbase's documented invariant for this frame. A pure
 * `z.array(...)` would accept an empty `errors: []` payload, which is
 * never legal here and would surface as a misleading `undefined` on
 * the first index access in `handleMessage`.
 */
export const ErrorFrameSchema = z.object({
  errors: z.tuple([ErrorEntrySchema]).rest(ErrorEntrySchema),
});
export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;
