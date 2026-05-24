/**
 * @file MongoDB adapter for `AuditPort`.
 *
 * **The most operationally critical adapter in the system.** This
 * file's "why" carries the weight of CLAUDE.md's most-cited
 * operational quirk: **MongoDB writes are off the hot publish path.**
 * Quoting the relevant section verbatim:
 *
 *   > A Mongo outage degrades the audit history but does not stop
 *   > aggregate publication for any asset. `AuditPort.append()` is
 *   > write-fail-safe: failures are logged at `warn` and the
 *   > aggregator continues.
 *
 * Every method in this adapter is therefore a wide try/catch that
 * logs `warn` on any error and returns either silently (for writes)
 * or with the safest possible fallback (empty list / null) for reads.
 * **No method throws to the caller.** The orchestrator and controllers
 * also try/catch defensively, but the port contract is "I will not
 * fail you".
 *
 * **Two collections.**
 *
 *  - `audit_events`: an append-only log of every discriminated
 *    `AuditEvent` (source state changes, breaker transitions,
 *    anomaly detections, diagnose request/answer). Sorted by `at` on
 *    read; capped indirectly by the `recent(limit)` API rather than
 *    by a Mongo TTL or capped collection — keeping all history is
 *    fine for the demo scale, and prevents the audit timeline from
 *    going blank after a long quiet period.
 *
 *  - `aggregate_snapshots`: one row per asset (upserted on every
 *    pulse that publishes). This is what `lastKnownAggregate(asset)`
 *    reads at boot to restore `runtime.lastAggregate` so the
 *    snapshot endpoint can serve immediately after a restart. See
 *    CLAUDE.md operational quirks: "Aggregator restart recovers
 *    `lastKnownAggregate` per asset from `AuditPort` and serves it
 *    via `/api/snapshot?asset=...` until the first new tick arrives."
 *
 * **Duplicate-key handling on `append`.** The `uniq_type_asset_source_at`
 * index makes `(type, asset, source, at)` unique. Two ingestor
 * retries can produce two identical audit events for the same logical
 * transition; the duplicate-key error (Mongo code 11000) is caught
 * and silently absorbed — this is *idempotent insert*, not an error.
 * Any other Mongo error logs `warn` and continues.
 *
 * **Boundary validation on read.** Both `recent` and
 * `lastKnownAggregate` parse the raw Mongo document through the
 * contract schema (`AuditEventSchema` / `AggregatePriceSchema`) and
 * **skip** any document that fails validation. A historical record
 * written by an older schema must not break a live audit query
 * (CLAUDE.md rule 5: validate at boundaries, including the boundary
 * out of Mongo).
 *
 * **`_id` projection off on reads.** We use `projection: { _id: 0 }`
 * so the document we feed to Zod matches the contract shape exactly
 * — no `_id` field to fight `z.strictObject(...)` in the audit-event
 * schemas. This is the canonical "Mongo is leaky, parse it back into
 * the contract" pattern.
 *
 * **`ensureIndexes()` is best-effort.** Called once at startup by the
 * DI factory in `app.module.ts`. If the index already exists, Mongo
 * is happy; if creation fails (permissions, etc.), we log `warn` and
 * continue — index absence means duplicates may accumulate, not that
 * the app cannot start.
 *
 * Cross-references:
 *  - `domain/ports/audit.port.ts`: the port contract this adapter
 *    implements.
 *  - `application/orchestrator.ts::appendAudit / drainSnapshots`:
 *    the two main callers and the in-memory drain queue.
 *  - CLAUDE.md operational quirks (Mongo off the hot path, restart
 *    recovery).
 *  - CLAUDE.md rule 20: `warn` level for recoverable boundary failures.
 */
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
/**
 * Mongo's well-known duplicate-key error code. We swallow this code
 * silently in `append()` so retried inserts are idempotent against
 * the `uniq_type_asset_source_at` index.
 */
const DUPLICATE_KEY_CODE = 11_000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : inspect(error);

export class MongoAudit implements AuditPort {
  private readonly auditEvents: Collection<Document>;
  private readonly aggregateSnapshots: Collection<Document>;

  /**
   * Constructor takes a connected `Db` (not a `MongoClient`) — the
   * DI factory in `app.module.ts` is responsible for the connection
   * lifecycle, and we want this class testable with a Mongo memory
   * server or a hand-rolled fake `Db` without dragging the driver's
   * connection logic into the unit tests.
   */
  constructor(
    db: Db,
    private readonly logger: Logger,
  ) {
    this.auditEvents = db.collection(AUDIT_EVENTS_COLLECTION);
    this.aggregateSnapshots = db.collection(AGGREGATE_SNAPSHOTS_COLLECTION);
  }

  /**
   * Create the uniqueness index that makes `append()` idempotent.
   * Best-effort: index-creation failure logs `warn` and continues.
   * Called once at startup by the DI factory.
   */
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

  /**
   * Insert one audit event. Fail-safe:
   *  - **Duplicate-key** (11000): silently return — the event was
   *    already recorded, and a retry should not look like a failure
   *    to the orchestrator.
   *  - **Any other Mongo error**: log `warn` and return.
   *
   * Spread the event into a fresh object so Mongo cannot mutate the
   * caller's value by inserting `_id` or any internal field.
   */
  async append(event: AuditEvent): Promise<void> {
    try {
      await this.auditEvents.insertOne({ ...event });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY_CODE) {
        // Idempotent retry — not an error.
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

  /**
   * Most-recent `limit` audit events, newest first, optionally
   * filtered by asset.
   *
   * Documents that fail `AuditEventSchema.safeParse` are **skipped
   * with a `warn` log**, not returned. A historical record written
   * by an older schema must not break the live audit query.
   *
   * Returns `[]` on Mongo errors — the dashboard's audit timeline
   * widget renders an empty list cleanly, which is a much better
   * failure mode than a 500.
   */
  async recent(limit: number, asset?: AssetId): Promise<readonly AuditEvent[]> {
    try {
      // Strip the Mongo-internal `_id` field so the document matches
      // the contract's `strictObject` shape exactly.
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
        // Per-document validation failure — log and skip. Keep
        // serving the rest of the page; one bad row should not
        // blank the audit timeline.
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

  /**
   * Upsert the latest aggregate for `aggregate.asset`. One row per
   * asset; subsequent writes replace the existing row.
   *
   * Filter on `{ asset }` + `replaceOne` + `upsert: true` is the
   * idempotent "make this row look like X" idiom — the row's
   * identity is the asset itself, not a generated `_id`.
   */
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

  /**
   * Read the persisted aggregate for `asset`. Called by the
   * orchestrator exactly once per asset at startup to enable the
   * "snapshot endpoint serves last-known value after a restart"
   * behavior.
   *
   * Returns `null` on three paths:
   *  - No row exists (fresh database).
   *  - Mongo read failed (logged at `warn`).
   *  - Row exists but failed `AggregatePriceSchema` validation
   *    (logged at `warn`). The snapshot endpoint then returns
   *    `aggregate: null` which the dashboard renders as "waiting
   *    for first tick".
   */
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
