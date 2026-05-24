/**
 * @file The chaos taxonomy — the discriminated union that defines
 * what kinds of failure the mock ingestor can synthesize, and the
 * per-asset state object that records "which failure is this asset
 * pretending to have right now?".
 *
 * **Why this file is special in the codebase.** The mock ingestor is
 * the *only* app that has a chaos surface. Binance and Coinbase
 * (`apps/ingestor-binance/`, `apps/ingestor-coinbase/`) are
 * **observation-only** — their failures are real (rate limits, dropped
 * connections, schema-invalid frames). Synthesizing a fake failure
 * inside a real ingestor would make the demo lie: the operator would
 * see a fake STALE source and the system would react to fiction. The
 * `decisions.md` entry on the chaos surface and CLAUDE.md operational
 * quirk ("Mock ingestor admin API is dev-only. Disable the admin API
 * via env flag in production.") both pin this down. The four modes
 * below are the *menu* of fictions the mock can serve up, and they
 * exist so a reviewer can drive the aggregator's degraded paths from
 * the dashboard without having to actually break the network.
 *
 * **How each mode is observed by the aggregator.** The point of the
 * taxonomy is that each mode triggers a *different* response in the
 * aggregator's domain (see `apps/aggregator/src/domain/`):
 *
 *  - `HEALTHY`:      normal random-walk publish (`random-walk.ts`).
 *                    Aggregator sees fresh ticks, source FSM stays
 *                    HEALTHY, breaker stays CLOSED.
 *  - `DISCONNECTED`: tick generator simply skips publishing for this
 *                    asset. Aggregator coverage drops, the source-state
 *                    FSM ages this source through HEALTHY → DEGRADED →
 *                    STALE as its freshness factor decays. Eventually
 *                    the breaker may trip if confidence falls below
 *                    the floor for the trip streak.
 *  - `STALE`:        tick generator keeps publishing, but it repeats
 *                    the same frozen `(price, sourceTimestamp)` pair
 *                    forever. *Freshness stays high* from the
 *                    aggregator's point of view (we keep sending ticks,
 *                    and the source FSM keys off `receivedAt`), but
 *                    cross-source agreement degrades as the other
 *                    sources move and this one does not. This is the
 *                    subtler chaos mode and a good demo of why we
 *                    aggregate by *agreement* in addition to freshness.
 *  - `MALFORMED`:    tick generator publishes a payload that is valid
 *                    JSON but fails `TickSchema` (`price: null`). The
 *                    aggregator's NATS subscriber rejects it at the
 *                    boundary (CLAUDE.md rule 5), logs a `warn`, and
 *                    emits a `SourceStateChanged`-adjacent audit
 *                    breadcrumb. No tick reaches the source FSM, so
 *                    the source ages the same way as `DISCONNECTED`.
 *
 * **Discriminated-union shape.** Each variant tags itself with `mode`
 * (the discriminator) and carries the minimum state needed by the
 * tick generator and the admin status response. `STALE` is the only
 * variant that needs extra fields (`frozenPrice`, `frozenSourceTimestamp`)
 * because it has to repeat them on every tick; the other three modes
 * are stateless beyond the timestamp at which they started.
 *
 * Sibling files: `chaos-state.service.ts` holds the per-asset state
 * map; `tick-generator.service.ts` reads it on every tick interval
 * and dispatches to the right publish/skip/repeat path; the dashboard's
 * `frontend/dashboard/src/widgets/chaos-controls/` widget is the UI
 * that drives the admin endpoints.
 */
import type { Millis, Price } from '@price-oracle/contracts/primitives';

/**
 * The closed set of chaos modes the mock can be in for a given asset.
 *
 * Modeled as a `const`-asserted object (per CLAUDE.md rule 3: "no
 * hardcoded strings for status, roles, events, or types"). Every
 * comparison elsewhere in the app goes through these symbols
 * (`state.mode === ChaosMode.STALE`), never a bare `'stale'` literal —
 * a typo'd literal would silently miss the branch at runtime, while
 * a typo'd property access fails at compile time.
 *
 * The wire-format values (`'healthy'`, `'disconnected'`, etc.) are
 * the strings the admin controller returns in its JSON response and
 * the dashboard chaos-controls widget rendered to the operator. Keep
 * them lowercase and self-describing — they appear in URLs and in
 * pino logs.
 */
export const ChaosMode = {
  HEALTHY: 'healthy',
  DISCONNECTED: 'disconnected',
  STALE: 'stale',
  MALFORMED: 'malformed',
} as const;

/**
 * The TypeScript-level union of mode strings (`'healthy' | 'disconnected'
 * | 'stale' | 'malformed'`). Derived from the const object above so
 * the value table and the type stay in lock-step: adding a new mode
 * requires adding it in exactly one place.
 */
export type ChaosMode = (typeof ChaosMode)[keyof typeof ChaosMode];

/**
 * The per-asset chaos state, modeled as a discriminated union on
 * `mode`.
 *
 * Three of the four variants are minimal (`{ mode, since }`):
 * `HEALTHY`, `DISCONNECTED`, and `MALFORMED` need no payload beyond
 * the timestamp at which the operator flipped the asset into this
 * mode. The admin status endpoint surfaces `since` so the dashboard
 * can show "DISCONNECTED for 12s".
 *
 * `STALE` is the only variant that carries data: when the operator
 * freezes an asset, we record the *last published* `(price, sourceTimestamp)`
 * pair, and the tick generator repeats exactly that pair on every
 * subsequent interval (see `tick-generator.service.ts`). Freezing
 * the source timestamp too — not just the price — is important: if
 * we kept advancing `sourceTimestamp = Date.now()` the aggregator
 * could potentially compute freshness off that field instead of
 * `receivedAt`, masking the chaos. Capturing both keeps the fiction
 * consistent end-to-end.
 *
 * Marked `readonly` recursively so a buggy mutation in the service
 * layer fails at compile time rather than silently corrupting state.
 */
export type ChaosState =
  | { readonly mode: typeof ChaosMode.HEALTHY; readonly since: Millis }
  | { readonly mode: typeof ChaosMode.DISCONNECTED; readonly since: Millis }
  | {
      readonly mode: typeof ChaosMode.STALE;
      readonly since: Millis;
      readonly frozenPrice: Price;
      readonly frozenSourceTimestamp: Millis;
    }
  | { readonly mode: typeof ChaosMode.MALFORMED; readonly since: Millis };
