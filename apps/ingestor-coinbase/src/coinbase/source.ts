/**
 * @file Single-constant module that names this ingestor's source id.
 *
 * Every published `Tick` carries a `source` field of type `SourceId`
 * (defined in `@price-oracle/contracts/primitives`). Typing the literal
 * against the closed `SourceId` enum is CLAUDE.md rule 3 in action:
 * "no hardcoded strings for status, roles, events, or types" — if
 * Coinbase were ever removed from `SourceId`, every consumer of this
 * constant would fail compilation in one place, rather than the
 * runtime breaking silently on a typo.
 *
 * It lives in its own file (rather than inline in `coinbase.service.ts`)
 * so the schemas, the subscribe builder, and the service can all
 * import the same value without introducing a circular dependency. The
 * Binance sibling, by contrast, keeps `BINANCE_SOURCE` as a local
 * constant in `binance.service.ts` — both shapes are acceptable;
 * Coinbase's wider file fan-out made hoisting the constant the cleaner
 * choice here.
 */
import type { SourceId } from '@price-oracle/contracts/primitives';

/**
 * Source-id constant for the Coinbase ingestor. Used:
 *  - as the `source` field on every published `Tick`,
 *  - as `sourceId` on every pino log line, so the dashboard's log
 *    filter can group Coinbase-specific entries,
 *  - as the second argument to `ticksSubject(asset, source)` from
 *    `@price-oracle/contracts/subjects` when building the NATS subject.
 */
export const COINBASE_SOURCE: SourceId = 'coinbase';
