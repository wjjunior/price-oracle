import { useBreakerStore } from '../model/breaker-store.js';

import type { GetSnapshotResponse } from '@price-oracle/contracts/rest';
import type { SseEnvelope } from '@price-oracle/contracts/sse';

type BreakerStateEnvelope = Extract<SseEnvelope, { type: 'breaker-state' }>;

export function applyBreakerStateEnvelope(envelope: BreakerStateEnvelope): void {
  useBreakerStore.getState().setBreaker(envelope.asset, envelope.data);
}

export function hydrateFromSnapshot(snapshot: GetSnapshotResponse): void {
  useBreakerStore.getState().setBreaker(snapshot.asset, snapshot.breaker);
}
