import type { AggregatePrice } from '../types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';

export interface AuditPort {
  append(event: AuditEvent): Promise<void>;
  recent(limit: number, asset?: AssetId): Promise<readonly AuditEvent[]>;
  lastKnownAggregate(asset: AssetId): Promise<AggregatePrice | null>;
}

export const AUDIT_PORT = Symbol.for('@price-oracle/aggregator/audit-port');
