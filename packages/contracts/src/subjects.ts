import type { AssetId, SourceId } from './primitives.js';

export const ticksSubject = (asset: AssetId, source: SourceId): `ticks.${AssetId}.${SourceId}` =>
  `ticks.${asset}.${source}` as const;

export const aggregatesSubject = (asset: AssetId): `aggregates.${AssetId}` =>
  `aggregates.${asset}` as const;

export const TICKS_SUBSCRIPTION_PATTERN = 'ticks.>' as const;
export const AGGREGATES_SUBSCRIPTION_PATTERN = 'aggregates.>' as const;

export const CORRELATION_HEADER = 'correlation-id' as const;
