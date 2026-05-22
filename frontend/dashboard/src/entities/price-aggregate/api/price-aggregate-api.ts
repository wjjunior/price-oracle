import { GetSnapshotResponseSchema, type GetSnapshotResponse } from '@price-oracle/contracts/rest';

import { usePriceAggregateStore } from '../model/price-store.js';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { SseEnvelope } from '@price-oracle/contracts/sse';

import { httpGet, type HttpOptions } from '@/shared/api/http-client';


type AggregateEnvelope = Extract<SseEnvelope, { type: 'aggregate' }>;

export function applyAggregateEnvelope(envelope: AggregateEnvelope): void {
  usePriceAggregateStore.getState().setAggregate(envelope.asset, envelope.data);
}

export function hydrateFromSnapshot(snapshot: GetSnapshotResponse): void {
  usePriceAggregateStore.getState().setAggregate(snapshot.asset, snapshot.aggregate);
}

export function loadPriceSnapshot(
  asset: AssetId,
  options?: HttpOptions,
): Promise<GetSnapshotResponse> {
  return httpGet(`/api/snapshot?asset=${asset}`, (v) => GetSnapshotResponseSchema.parse(v), options);
}
