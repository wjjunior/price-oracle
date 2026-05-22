import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { AuditEvent } from '@price-oracle/contracts/events';

export const MAX_AUDIT_EVENTS = 200;

function auditKey(event: AuditEvent): string {
  const asset = 'asset' in event ? event.asset : '';
  return `${event.type}|${asset}|${event.at}`;
}

function merge(existing: readonly AuditEvent[], incoming: readonly AuditEvent[]): AuditEvent[] {
  const seen = new Set<string>();
  const deduped: AuditEvent[] = [];
  for (const event of [...incoming, ...existing]) {
    const key = auditKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }
  deduped.sort((a, b) => b.at - a.at);
  return deduped.slice(0, MAX_AUDIT_EVENTS);
}

type AuditStoreState = {
  events: AuditEvent[];
  append: (event: AuditEvent) => void;
  seed: (events: readonly AuditEvent[]) => void;
};

export const useAuditStore = create<AuditStoreState>()(
  subscribeWithSelector((set) => ({
    events: [],
    append: (event): void => set((state) => ({ events: merge(state.events, [event]) })),
    seed: (events): void => set((state) => ({ events: merge(state.events, events) })),
  })),
);

export function useAuditEvents(): AuditEvent[] {
  return useAuditStore((state) => state.events);
}
