import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { SseEnvelope } from '@price-oracle/contracts/sse';

import { applyAuditEnvelope, loadAuditEvents, seedAuditEvents } from '@/entities/audit-event';
import {
  applyAggregateEnvelope,
  hydrateFromSnapshot as hydratePrice,
  loadPriceSnapshot,
} from '@/entities/price-aggregate';
import { applySourceHealthEnvelope, hydrateFromSnapshot as hydrateSource } from '@/entities/source';
import { createSseClient, type SseConnectionState } from '@/shared/api/sse-client';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];
const STREAM_URL = '/api/stream';

async function hydrate(): Promise<void> {
  await Promise.all([
    ...ASSETS.map(async (asset) => {
      const snapshot = await loadPriceSnapshot(asset);
      hydratePrice(snapshot);
      hydrateSource(snapshot);
    }),
    loadAuditEvents().then(seedAuditEvents),
  ]);
}

function routeAggregate(envelope: SseEnvelope): void {
  if (envelope.type === 'aggregate') applyAggregateEnvelope(envelope);
}

function routeSourceHealth(envelope: SseEnvelope): void {
  if (envelope.type === 'source-health') applySourceHealthEnvelope(envelope);
}

function routeAudit(envelope: SseEnvelope): void {
  if (envelope.type === 'audit') applyAuditEnvelope(envelope);
}

export function useDashboardData(): { connectionState: SseConnectionState } {
  const [connectionState, setConnectionState] = useState<SseConnectionState>('connecting');

  useEffect(() => {
    hydrate().catch(() => toast.error('Failed to load the latest dashboard snapshot'));

    const client = createSseClient(STREAM_URL);
    setConnectionState(client.getState());
    const unsubscribes = [
      client.subscribe({ type: 'aggregate' }, routeAggregate),
      client.subscribe({ type: 'source-health' }, routeSourceHealth),
      client.subscribe({ type: 'audit' }, routeAudit),
      client.onStateChange(setConnectionState),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      client.close();
    };
  }, []);

  return { connectionState };
}
