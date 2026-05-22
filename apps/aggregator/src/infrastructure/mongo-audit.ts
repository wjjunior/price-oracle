import { inspect } from 'node:util';

import { AggregatePriceSchema, AuditEventSchema } from '@price-oracle/contracts/events';
import { MongoServerError } from 'mongodb';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { AggregatePrice } from '../domain/types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';
import type { Collection, Db, Document } from 'mongodb';
import type { Logger } from 'pino';

const AUDIT_EVENTS_COLLECTION = 'audit_events';
const AGGREGATE_SNAPSHOTS_COLLECTION = 'aggregate_snapshots';
const AUDIT_INDEX_NAME = 'uniq_type_asset_source_at';
const DUPLICATE_KEY_CODE = 11_000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : inspect(error);

export class MongoAudit implements AuditPort {
  private readonly auditEvents: Collection<Document>;
  private readonly aggregateSnapshots: Collection<Document>;

  constructor(
    db: Db,
    private readonly logger: Logger,
  ) {
    this.auditEvents = db.collection(AUDIT_EVENTS_COLLECTION);
    this.aggregateSnapshots = db.collection(AGGREGATE_SNAPSHOTS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    try {
      await this.auditEvents.createIndex(
        { type: 1, asset: 1, source: 1, at: 1 },
        { unique: true, name: AUDIT_INDEX_NAME },
      );
    } catch (error) {
      this.logger.warn(
        { event: 'audit.ensure-indexes-failed', error: errorMessage(error) },
        'Audit index creation failed',
      );
    }
  }

  async append(event: AuditEvent): Promise<void> {
    try {
      await this.auditEvents.insertOne({ ...event });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY_CODE) {
        return;
      }
      this.logger.warn(
        {
          event: 'audit.append-failed',
          type: event.type,
          asset: event.asset,
          error: errorMessage(error),
        },
        'Audit append failed',
      );
    }
  }

  async recent(limit: number, asset?: AssetId): Promise<readonly AuditEvent[]> {
    try {
      const docs = await this.auditEvents
        .find(asset ? { asset } : {}, { projection: { _id: 0 } })
        .sort({ at: -1 })
        .limit(limit)
        .toArray();

      const events: AuditEvent[] = [];
      for (const doc of docs) {
        const parsed = AuditEventSchema.safeParse(doc);
        if (parsed.success) {
          events.push(parsed.data);
          continue;
        }
        this.logger.warn(
          { event: 'audit.read-invalid', issues: parsed.error.issues },
          'Skipping invalid audit document',
        );
      }
      return events;
    } catch (error) {
      this.logger.warn(
        { event: 'audit.read-failed', error: errorMessage(error) },
        'Audit read failed',
      );
      return [];
    }
  }

  async recordAggregate(aggregate: AggregatePrice): Promise<void> {
    try {
      await this.aggregateSnapshots.replaceOne({ asset: aggregate.asset }, aggregate, {
        upsert: true,
      });
    } catch (error) {
      this.logger.warn(
        {
          event: 'audit.record-aggregate-failed',
          asset: aggregate.asset,
          error: errorMessage(error),
        },
        'Aggregate snapshot record failed',
      );
    }
  }

  async lastKnownAggregate(asset: AssetId): Promise<AggregatePrice | null> {
    try {
      const doc = await this.aggregateSnapshots.findOne({ asset }, { projection: { _id: 0 } });
      if (!doc) {
        return null;
      }
      const parsed = AggregatePriceSchema.safeParse(doc);
      if (parsed.success) {
        return parsed.data;
      }
      this.logger.warn(
        { event: 'audit.read-invalid', asset, issues: parsed.error.issues },
        'Skipping invalid aggregate snapshot',
      );
      return null;
    } catch (error) {
      this.logger.warn(
        { event: 'audit.read-failed', asset, error: errorMessage(error) },
        'Aggregate snapshot read failed',
      );
      return null;
    }
  }
}
