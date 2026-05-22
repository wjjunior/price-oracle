import { GetSnapshotResponseSchema, type GetSnapshotResponse } from '@price-oracle/contracts/rest';

import { usePriceHistoryStore } from '../model/history-store.js';
import { usePriceAggregateStore } from '../model/price-store.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';
import type { SseEnvelope } from '@price-oracle/contracts/sse';

import { httpGet, type HttpOptions } from '@/shared/api/http-client';


type AggregateEnvelope = Extract<SseEnvelope, { type: 'aggregate' }>;

function recordTrendPoint(aggregate: AggregatePrice | null): void {
  if (aggregate === null) return;
  usePriceHistoryStore.getState().push(aggregate.asset, {
    t: aggregate.computedAt,
    price: aggregate.price,
    confidence: aggregate.confidence,
  });
}

export function applyAggregateEnvelope(envelope: AggregateEnvelope): void {
  usePriceAggregateStore.getState().setAggregate(envelope.asset, envelope.data);
  recordTrendPoint(envelope.data);
}

export function hydrateFromSnapshot(snapshot: GetSnapshotResponse): void {
  usePriceAggregateStore.getState().setAggregate(snapshot.asset, snapshot.aggregate);
  recordTrendPoint(snapshot.aggregate);
}

export function loadPriceSnapshot(
  asset: AssetId,
  options?: HttpOptions,
): Promise<GetSnapshotResponse> {
  return httpGet(`/api/snapshot?asset=${asset}`, (v) => GetSnapshotResponseSchema.parse(v), options);
}
