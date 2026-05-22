import { useSourceStore } from '../model/source-store.js';

import type { GetSnapshotResponse } from '@price-oracle/contracts/rest';
import type { SseEnvelope } from '@price-oracle/contracts/sse';


type SourceHealthEnvelope = Extract<SseEnvelope, { type: 'source-health' }>;

export function applySourceHealthEnvelope(envelope: SourceHealthEnvelope): void {
  useSourceStore.getState().setSource(envelope.data);
}

export function hydrateFromSnapshot(snapshot: GetSnapshotResponse): void {
  useSourceStore.getState().setSources(snapshot.sources);
}
