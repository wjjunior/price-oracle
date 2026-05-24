/**
 * @file Outer discriminated union of any frame the Coinbase Advanced
 * Trade WebSocket sends on a channel — i.e. anything that carries a
 * `channel` field.
 *
 * This file is the structural reason the Coinbase ingestor has more
 * moving parts than the Binance one. Coinbase exposes a single WS URL
 * (see `config/env.schema.ts`) and *multiplexes* heterogeneous frame
 * types over it: data frames (one per subscribed channel), and the
 * `subscriptions` confirmation/echo frame that the broker emits after
 * each subscribe/unsubscribe. We use `z.discriminatedUnion('channel',
 * ...)` so a single `.safeParse(...)` in `CoinbaseService.handleMessage`
 * narrows to the correct branch and the rest of the handler can
 * dispatch on `frame.channel` with full type safety. Binance, by
 * contrast, gets away with a single envelope schema because it only
 * ever delivers one frame type.
 *
 * Two kinds of frames are *not* covered by this union:
 *
 *  - **Error frames** (`{ errors: [...] }`) — they have no `channel`
 *    field at all, so they cannot live in this discriminated union.
 *    They are parsed speculatively *first* in `handleMessage` against
 *    `ErrorFrameSchema` (`./error-frame.schema.ts`) before falling
 *    through to this schema.
 *  - **Heartbeats and other channels we do not subscribe to.** A frame
 *    on an unsubscribed channel would fail the discriminated parse and
 *    be logged at `warn` as `ws.frame.schema_invalid` — defensive
 *    handling for the case Coinbase ever pushes an unsolicited frame.
 *
 * The `events: z.array(z.unknown())` on `SubscriptionsFrameSchema` is
 * intentional: we never read the body of a subscription confirmation;
 * we only need to know it arrived (logged at `debug` so an operator
 * tracing the subscribe handshake can confirm acknowledgement, but the
 * frame is otherwise a no-op on the data path).
 */
import { z } from 'zod';

import { MarketTradesFrameSchema } from './market-trades.schema.js';

/**
 * Frame Coinbase emits after a `subscribe` (or `unsubscribe`) message,
 * echoing the current subscription state. We keep its shape strict
 * enough to fail-loud on protocol drift but do not deserialize the
 * `events` payload — see this file's header for the rationale.
 */
export const SubscriptionsFrameSchema = z.object({
  channel: z.literal('subscriptions'),
  timestamp: z.iso.datetime(),
  sequence_num: z.number().int().nonnegative(),
  events: z.array(z.unknown()),
});

/**
 * Discriminated union of all *channelled* frame types we accept. Today:
 * `market_trades` (data) and `subscriptions` (control). Adding a new
 * channel — say `heartbeats` if we ever opt into them — is a matter of
 * defining a new `*FrameSchema` with `channel: z.literal('heartbeats')`
 * and adding it here; `FrameSchema.safeParse` will then route it
 * automatically, and the exhaustive `switch` on `frame.channel` in
 * `CoinbaseService.handleMessage` will fail compilation until the new
 * branch is handled.
 */
export const FrameSchema = z.discriminatedUnion('channel', [
  MarketTradesFrameSchema,
  SubscriptionsFrameSchema,
]);
export type Frame = z.infer<typeof FrameSchema>;
