import { MongoServerError } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import { MongoAudit } from './mongo-audit.js';

import type { AggregatePrice } from '../domain/types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { Db } from 'mongodb';
import type { Logger } from 'pino';

const fakeCursor = (docs: unknown[]) => {
  const cursor = {
    sort: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    toArray: vi.fn(async () => docs),
  };
  return cursor;
};

const fakeMongo = (reads: { recent?: unknown[]; snapshot?: unknown } = {}) => {
  const cursor = fakeCursor(reads.recent ?? []);
  const insertOne = vi.fn(async (_doc: Record<string, unknown>) => ({}));
  const find = vi.fn(() => cursor);
  const findOne = vi.fn(async () => reads.snapshot ?? null);
  const replaceOne = vi.fn(async () => ({}));
  const createIndex = vi.fn(async () => 'uniq_type_asset_source_at');
  const collection = vi.fn(() => ({ insertOne, find, findOne, replaceOne, createIndex }));
  const db = { collection } as unknown as Db;
  return { db, insertOne, find, findOne, replaceOne, createIndex, cursor };
};

const fakeLogger = () => ({ warn: vi.fn(), debug: vi.fn() }) as unknown as Logger;

const auditEvent: AuditEvent = {
  type: 'SourceStateChanged',
  asset: 'btc',
  source: 'binance',
  from: 'HEALTHY',
  to: 'DEGRADED',
  at: 1_747_000_000_000,
};

const aggregate: AggregatePrice = {
  asset: 'btc',
  price: 65_000,
  confidence: 0.95,
  contributingSources: ['binance', 'coinbase'],
  computedAt: 1_747_000_000_000,
};

describe('MongoAudit', () => {
  it('should insert an audit event into audit_events on append', async () => {
    const mongo = fakeMongo();
    await new MongoAudit(mongo.db, fakeLogger()).append(auditEvent);
    expect(mongo.insertOne).toHaveBeenCalledWith(auditEvent);
  });

  it('should insert a copy so the driver cannot mutate the caller event with _id', async () => {
    const mongo = fakeMongo();
    mongo.insertOne.mockImplementationOnce(async (doc: Record<string, unknown>) => {
      doc._id = 'generated';
      return {};
    });
    const event = { ...auditEvent };
    const snapshot = structuredClone(event);

    await new MongoAudit(mongo.db, fakeLogger()).append(event);
    expect(event).toEqual(snapshot);
  });

  it('should treat a duplicate-key error as an idempotent no-op', async () => {
    const mongo = fakeMongo();
    mongo.insertOne.mockRejectedValueOnce(
      Object.assign(new MongoServerError({ message: 'dup' }), { code: 11_000 }),
    );
    const logger = fakeLogger();

    await expect(new MongoAudit(mongo.db, logger).append(auditEvent)).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should warn and not throw when append fails for a non-duplicate error', async () => {
    const mongo = fakeMongo();
    mongo.insertOne.mockRejectedValueOnce(new Error('connection lost'));
    const logger = fakeLogger();

    await expect(new MongoAudit(mongo.db, logger).append(auditEvent)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit.append-failed', error: 'connection lost' }),
      expect.any(String),
    );
  });

  it('should serialize a non-Error rejection instead of stringifying it as [object Object]', async () => {
    const mongo = fakeMongo();
    mongo.insertOne.mockRejectedValueOnce({ reason: 'driver fault' });
    const logger = fakeLogger();

    await new MongoAudit(mongo.db, logger).append(auditEvent);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'audit.append-failed',
        error: expect.stringContaining('driver fault'),
      }),
      expect.any(String),
    );
  });

  it('should query recent events sorted by at descending with the given limit, filtering by asset when provided', async () => {
    const mongo = fakeMongo({ recent: [auditEvent] });
    const result = await new MongoAudit(mongo.db, fakeLogger()).recent(10, 'btc');

    expect(mongo.find).toHaveBeenCalledWith({ asset: 'btc' }, { projection: { _id: 0 } });
    expect(mongo.cursor.sort).toHaveBeenCalledWith({ at: -1 });
    expect(mongo.cursor.limit).toHaveBeenCalledWith(10);
    expect(result).toEqual([auditEvent]);
  });

  it('should query recent events without an asset filter when none is provided', async () => {
    const mongo = fakeMongo({ recent: [auditEvent] });
    await new MongoAudit(mongo.db, fakeLogger()).recent(5);
    expect(mongo.find).toHaveBeenCalledWith({}, { projection: { _id: 0 } });
  });

  it('should skip an invalid audit document and warn with the validation issues', async () => {
    const mongo = fakeMongo({ recent: [{ type: 'NotAnEvent', asset: 'btc' }, auditEvent] });
    const logger = fakeLogger();
    const result = await new MongoAudit(mongo.db, logger).recent(10);

    expect(result).toEqual([auditEvent]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit.read-invalid', issues: expect.any(Array) }),
      expect.any(String),
    );
  });

  it('should warn and return an empty array when the recent query fails', async () => {
    const mongo = fakeMongo();
    mongo.cursor.toArray.mockRejectedValueOnce(new Error('read outage'));
    const logger = fakeLogger();

    const result = await new MongoAudit(mongo.db, logger).recent(10);
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit.read-failed', error: 'read outage' }),
      expect.any(String),
    );
  });

  it('should replace the aggregate snapshot keyed by asset on recordAggregate', async () => {
    const mongo = fakeMongo();
    await new MongoAudit(mongo.db, fakeLogger()).recordAggregate(aggregate);
    expect(mongo.replaceOne).toHaveBeenCalledWith({ asset: 'btc' }, aggregate, { upsert: true });
  });

  it('should warn and not throw when recordAggregate fails', async () => {
    const mongo = fakeMongo();
    mongo.replaceOne.mockRejectedValueOnce(new Error('connection lost'));
    const logger = fakeLogger();

    await expect(
      new MongoAudit(mongo.db, logger).recordAggregate(aggregate),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit.record-aggregate-failed', asset: 'btc' }),
      expect.any(String),
    );
  });

  it('should return the parsed aggregate from lastKnownAggregate when a snapshot exists', async () => {
    const mongo = fakeMongo({ snapshot: aggregate });
    const result = await new MongoAudit(mongo.db, fakeLogger()).lastKnownAggregate('btc');
    expect(mongo.findOne).toHaveBeenCalledWith({ asset: 'btc' }, { projection: { _id: 0 } });
    expect(result).toEqual(aggregate);
  });

  it('should return null from lastKnownAggregate when no snapshot exists', async () => {
    const mongo = fakeMongo({ snapshot: null });
    const result = await new MongoAudit(mongo.db, fakeLogger()).lastKnownAggregate('btc');
    expect(result).toBeNull();
  });

  it('should return null and warn when the stored snapshot is invalid', async () => {
    const mongo = fakeMongo({ snapshot: { asset: 'btc', price: 1 } });
    const logger = fakeLogger();
    const result = await new MongoAudit(mongo.db, logger).lastKnownAggregate('btc');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit.read-invalid', asset: 'btc' }),
      expect.any(String),
    );
  });

  it('should create a unique index on (type, asset, source, at) in ensureIndexes', async () => {
    const mongo = fakeMongo();
    await new MongoAudit(mongo.db, fakeLogger()).ensureIndexes();
    expect(mongo.createIndex).toHaveBeenCalledWith(
      { type: 1, asset: 1, source: 1, at: 1 },
      expect.objectContaining({ unique: true, name: 'uniq_type_asset_source_at' }),
    );
  });

  it('should warn and not throw when index creation fails at boot', async () => {
    const mongo = fakeMongo();
    mongo.createIndex.mockRejectedValueOnce(new Error('mongo down'));
    const logger = fakeLogger();

    await expect(new MongoAudit(mongo.db, logger).ensureIndexes()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit.ensure-indexes-failed', error: 'mongo down' }),
      expect.any(String),
    );
  });
});
