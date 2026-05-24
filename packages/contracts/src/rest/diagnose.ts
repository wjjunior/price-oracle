/**
 * @file Request and response schemas for `POST /api/diagnose`.
 *
 * The diagnose endpoint produces a markdown explanation of the
 * current state of an asset — "BTC confidence dropped to 0.42 after
 * coinbase staleness exceeded 8s", that flavor of operator-facing
 * narrative. Backed by Anthropic when `ANTHROPIC_API_KEY` is set,
 * or by a deterministic stub adapter when it isn't (see
 * `decisions.md` on the composition-time selector).
 *
 * The endpoint is rate-limited per-asset and deduplicated on a
 * content-hash of the underlying snapshot+audit context — operators
 * hammering the button do not multiply LLM cost.
 *
 * Request:
 *  - `trigger` (optional): short label describing why the diagnose
 *    was requested ("operator-manual", "breaker-trip", ...). Logged
 *    into the audit `DiagnoseRequested` event so the timeline
 *    explains *what caused* the diagnose, not just that it happened.
 *
 * Response:
 *  - `asset`:        echoed for client-side routing of streaming
 *                    answers (today the answer is non-streaming,
 *                    but the field future-proofs the contract).
 *  - `markdown`:     the actual answer body, rendered client-side
 *                    by `react-markdown`.
 *  - `latencyMs`:    LLM round-trip; surfaces in the dashboard's
 *                    diagnose card as a small metadata line.
 *  - `tokensUsed`:   optional — only the Anthropic adapter reports
 *                    it; the stub adapter omits it.
 *  - `generatedAt`:  for "as of …" labelling and cache freshness.
 */
import { z } from 'zod';

import { AssetId, Millis } from '../primitives.js';

export const PostDiagnoseRequestSchema = z.strictObject({
  trigger: z.string().min(1).optional(),
});
export type PostDiagnoseRequest = z.infer<typeof PostDiagnoseRequestSchema>;

export const PostDiagnoseResponseSchema = z.strictObject({
  asset: AssetId,
  markdown: z.string().min(1),
  latencyMs: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative().optional(),
  generatedAt: Millis,
});
export type PostDiagnoseResponse = z.infer<typeof PostDiagnoseResponseSchema>;
