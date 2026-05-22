import { useAuditStore } from '../model/audit-store.js';

import type { GetAuditResponse } from '@price-oracle/contracts/rest';
import type { SseEnvelope } from '@price-oracle/contracts/sse';


type AuditEnvelope = Extract<SseEnvelope, { type: 'audit' }>;

export function applyAuditEnvelope(envelope: AuditEnvelope): void {
  useAuditStore.getState().append(envelope.data);
}

export function seedAuditEvents(response: GetAuditResponse): void {
  useAuditStore.getState().seed(response.events);
}
