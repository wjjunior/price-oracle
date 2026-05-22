import { GetAuditResponseSchema } from '@price-oracle/contracts/rest';

import { useAuditStore } from '../model/audit-store.js';

import type { GetAuditResponse } from '@price-oracle/contracts/rest';
import type { SseEnvelope } from '@price-oracle/contracts/sse';

import { httpGet, type HttpOptions } from '@/shared/api/http-client.js';


type AuditEnvelope = Extract<SseEnvelope, { type: 'audit' }>;

const DEFAULT_AUDIT_LIMIT = 20;

export function applyAuditEnvelope(envelope: AuditEnvelope): void {
  useAuditStore.getState().append(envelope.data);
}

export function seedAuditEvents(response: GetAuditResponse): void {
  useAuditStore.getState().seed(response.events);
}

export function loadAuditEvents(
  limit = DEFAULT_AUDIT_LIMIT,
  options?: HttpOptions,
): Promise<GetAuditResponse> {
  return httpGet(`/api/audit?limit=${limit}`, (value) => GetAuditResponseSchema.parse(value), options);
}
