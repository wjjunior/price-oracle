/**
 * @file Deterministic fingerprint of a `DiagnoseContext`.
 *
 * **What this is for.** Two consumers:
 *
 *  1. **Rate-limit decorator dedup** — `rate-limited-diagnose.decorator.ts`
 *     keys the in-flight Map by `${asset}:${hashDiagnoseContext(context)}`,
 *     so two parallel requests with structurally identical context
 *     join the same Promise instead of making two upstream calls.
 *     This is how a double-click on the dashboard "diagnose" button
 *     does not double-charge the LLM.
 *
 *  2. **Stub adapter signature** — `stub-diagnose.adapter.ts` prints
 *     the hash in the rendered Markdown so a reviewer can verify
 *     "same input → same response" at a glance during demos. Useful
 *     for explaining why the rate-limit decorator merged a request.
 *
 * **Why a hand-rolled canonical JSON, not just `JSON.stringify(context)`.**
 * Object key iteration order in JS is *mostly* insertion order, but:
 *
 *  - Two callers can build the same logical context with fields in
 *    different orders.
 *  - `recentEvents` is an array of discriminated-union events; each
 *    variant has different fields, and the natural construction
 *    order (e.g. `{ type, asset, source, at }` vs `{ type, asset,
 *    at, source }`) differs across builders.
 *  - `sources` is an array iterated in `Map.values()` order, which
 *    depends on insertion order — and the orchestrator's insertion
 *    order is determined by `config.sources`, which is fine, but the
 *    diagnose controller builds its snapshot from
 *    `orchestrator.getSourceStates(asset)`, and we want the hash
 *    invariant to a hypothetical reordering of that list.
 *
 * The canonical-JSON step normalizes by:
 *  - **Sorting source entries** by their string form. Pre-flattens
 *    each source into `source:health:lastTickAt:lastPrice` so the
 *    sort is on a single string per source, not a structural compare.
 *  - **Sorting event keys** alphabetically inside each event's
 *    serialization (via `JSON.stringify(e, Object.keys(e).sort())`).
 *  - **Sorting events themselves** by their string form. The "by at"
 *    order is the natural one, but sorting by full string is more
 *    robust to two events sharing an `at`.
 *
 * **Why a 16-char SHA-256 prefix.** Birthday collision on 64 bits is
 * `~2^32` distinct contexts — vastly more than any operator will
 * ever produce. The 16 chars keep the rendered fingerprint short
 * enough for the dashboard's Markdown footer (the stub prints it as
 * a citation).
 *
 * **`localeCompare` for sorting strings.** Stable across V8 and JSC,
 * unicode-aware. The default `Array.sort` comparator is locale-
 * sensitive in older environments — being explicit removes the
 * variability.
 *
 * Cross-references:
 *  - `rate-limited-diagnose.decorator.ts`: the in-flight dedup
 *    consumer.
 *  - `stub-diagnose.adapter.ts`: the visible-fingerprint consumer.
 *  - `domain/ports/diagnose.port.ts`: the `DiagnoseContext` shape.
 */
import { createHash } from 'node:crypto';

import type { DiagnoseContext } from '../../domain/ports/diagnose.port.js';

/**
 * SHA-256 prefix length to render. 16 hex chars = 64 bits — enough
 * for human-eyeable demos and well clear of accidental collision.
 */
const HASH_PREFIX_LENGTH = 16;

/**
 * Pinned comparator used everywhere we sort string arrays. See file
 * header for the locale-stability reasoning.
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Produce a 16-hex-char fingerprint of a diagnose context.
 *
 * Step-by-step:
 *  1. Flatten each source to a single string and sort.
 *  2. Canonicalize each event by sorting its keys before
 *     `JSON.stringify`, then sort the resulting strings.
 *  3. Wrap into a top-level object with `asset` / `confidence` /
 *     `breaker` / the two normalized arrays.
 *  4. `JSON.stringify` (object key order is the literal order in
 *     the object literal above — controlled by us, not the caller).
 *  5. SHA-256, hex, take first 16 chars.
 */
export function hashDiagnoseContext(context: DiagnoseContext): string {
  // Step 1: per-source flat-string + sort. Includes the four fields
  // an operator would consider semantically meaningful for "same
  // health story" — health label, last tick time, last price.
  const sources = [...context.sources]
    .map((s) => `${s.source}:${s.health}:${s.lastTickAt ?? 'null'}:${s.lastPrice ?? 'null'}`)
    .sort(compareStrings);
  // Step 2: per-event canonical JSON + sort. `Object.keys(e).sort()`
  // forces a deterministic key order regardless of how the event
  // builder constructed the object.
  const events = [...context.recentEvents]
    .map((e) => JSON.stringify(e, Object.keys(e).sort(compareStrings)))
    .sort(compareStrings);
  // Step 3+4: stable canonical envelope.
  const canonical = JSON.stringify({
    asset: context.asset,
    confidence: context.confidence,
    breaker: context.breaker,
    sources,
    events,
  });
  // Step 5: hash + prefix.
  return createHash('sha256').update(canonical).digest('hex').slice(0, HASH_PREFIX_LENGTH);
}
