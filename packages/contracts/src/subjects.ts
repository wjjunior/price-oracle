/**
 * @file NATS subject builders and the correlation-ID header constant.
 *
 * Subjects are how services find each other on the NATS bus. Two
 * design properties are visible in this file:
 *
 *  1. Subjects are **asset-parameterized** by design. There is no
 *     global `ticks` topic — every tick lives on `ticks.btc.binance`
 *     or `ticks.eth.coinbase`, never on a shared firehose. The
 *     aggregator subscribes to the wildcard pattern `ticks.>` and
 *     routes internally; consumers that only care about one asset
 *     can subscribe to `ticks.btc.>` instead. This is what makes
 *     per-asset isolation cheap (see `decisions.md` entry on
 *     "per-asset isolation throughout").
 *
 *  2. The literal-template return types (`ticks.${AssetId}.${SourceId}`)
 *     let TypeScript catch a wrong subject at compile time — passing
 *     a `Price` where an `AssetId` is expected won't type-check, so
 *     we can't accidentally publish on `ticks.65000.binance`.
 *
 * The implementation is intentionally a one-liner per function: the
 * subject is part of the contract, not an algorithm.
 */
import type { AssetId, SourceId } from './primitives.js';

/**
 * Build a tick subject for a specific asset/source pair.
 *
 * Used by:
 *  - ingestor adapters when publishing a parsed `Tick`;
 *  - aggregator when filtering ticks per (asset, source) in tests
 *    or in adapter wiring (production uses the wildcard pattern below).
 *
 * @example
 *   ticksSubject('btc', 'binance') // → "ticks.btc.binance"
 */
export const ticksSubject = (asset: AssetId, source: SourceId): `ticks.${AssetId}.${SourceId}` =>
  `ticks.${asset}.${source}` as const;

/**
 * Build the aggregate subject for an asset.
 *
 * Used by the aggregator when publishing an `AggregatePrice`, and by
 * any consumer (today only the SSE controller) that subscribes to
 * aggregates for a specific asset.
 *
 * @example
 *   aggregatesSubject('eth') // → "aggregates.eth"
 */
export const aggregatesSubject = (asset: AssetId): `aggregates.${AssetId}` =>
  `aggregates.${asset}` as const;

/**
 * Wildcard subscription pattern used by the aggregator to receive
 * every tick from every source for every asset on one subscription,
 * then route internally by parsing the subject path. Single
 * subscription means a single NATS consumer, which is the simplest
 * shape for Core NATS pub/sub (no JetStream consumer groups needed).
 */
export const TICKS_SUBSCRIPTION_PATTERN = 'ticks.>' as const;

/**
 * Wildcard subscription pattern for every aggregate of every asset.
 * The SSE controller uses this to fan aggregates out to dashboard
 * connections.
 */
export const AGGREGATES_SUBSCRIPTION_PATTERN = 'aggregates.>' as const;

/**
 * NATS message header carrying the per-tick / per-request correlation
 * ID. Set at the ingestor, propagated by the aggregator into pino
 * logs and into the SSE envelope so the operator can grep a single
 * value across every service log.
 *
 * Header name (not value) is part of the contract — the value itself
 * is validated by the `CorrelationId` primitive in `primitives.ts`.
 */
export const CORRELATION_HEADER = 'correlation-id' as const;
