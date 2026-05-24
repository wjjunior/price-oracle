/**
 * @file `GET /api/snapshot?asset=...` controller — the dashboard's
 * initial hydration call.
 *
 * **What this is for.** Returns the orchestrator's current per-asset
 * state in one round trip: the last published aggregate, every
 * source's FSM state, and the breaker state. The dashboard calls
 * this exactly once per mount per asset before opening the SSE
 * stream — the snapshot fills the widgets with initial values; the
 * SSE stream then keeps them live.
 *
 * **Restart recovery (CLAUDE.md operational quirks).** Quoting:
 *
 *   > Aggregator restart recovers `lastKnownAggregate` per asset
 *   > from `AuditPort` and serves it via `/api/snapshot?asset=...`
 *   > until the first new tick arrives.
 *
 * That is why this controller can return a non-null `aggregate`
 * even when the orchestrator has only been running for a few
 * milliseconds: `Orchestrator.start()` calls
 * `AuditPort.lastKnownAggregate(asset)` for each asset before
 * scheduling the pulse, so `getSnapshot(asset)` returns the persisted
 * value immediately. The dashboard never sees a "starting up" gap.
 *
 * **Boundary translation on `contributingSources`.** The internal
 * `AggregatePrice.contributingSources` is `readonly SourceId[]`; the
 * contract response uses a mutable `SourceId[]`. `toResponseAggregate`
 * copies the array exactly once at the boundary. This pattern shows
 * up wherever the domain hands off to a wire format — see also the
 * SSE emit path in `orchestrator.ts::pulseAsset`.
 *
 * **Per-asset correlation ID.** Each `/api/snapshot` request gets a
 * fresh `randomUUID()` correlation ID. Logged with the request,
 * not returned in the response — REST snapshot requests are
 * stateless from the dashboard's point of view, but an operator
 * grepping logs can still trace one request's lifecycle.
 *
 * **DI tokens explicit (CLAUDE.md operational quirks).** Every
 * constructor parameter uses `@Inject(...)` because `tsx` does not
 * emit decorator metadata — type-based injection silently resolves
 * to `undefined`.
 *
 * Cross-references:
 *  - `application/orchestrator.ts::getSnapshot / getSourceStates /
 *    getBreakerState`: the three read-only accessors composed here.
 *  - `domain/ports/audit.port.ts::lastKnownAggregate`: how the
 *    snapshot survives restart.
 *  - `@price-oracle/contracts/rest::GetSnapshotResponse`: the wire
 *    contract.
 *  - `frontend/dashboard/src/entities/price-aggregate`: the consumer.
 */
import { randomUUID } from 'node:crypto';

import { Controller, Get, Inject, Query } from '@nestjs/common';

import { Orchestrator } from '../application/orchestrator.js';

import { AssetParamPipe } from './asset-param.pipe.js';
import { LOGGER } from './tokens.js';

import type { AggregatePrice } from '../domain/types.js';
import type { AssetId } from '@price-oracle/contracts/primitives';
import type { GetSnapshotResponse } from '@price-oracle/contracts/rest';
import type { Logger } from 'pino';

const SNAPSHOT_EVENT = 'http.snapshot';

/**
 * Boundary copy: spread `aggregate` and copy `contributingSources`
 * into a fresh mutable array. The domain type uses
 * `readonly SourceId[]`; the contract type uses `SourceId[]`.
 */
const toResponseAggregate = (
  aggregate: AggregatePrice | null,
): GetSnapshotResponse['aggregate'] =>
  aggregate === null
    ? null
    : { ...aggregate, contributingSources: [...aggregate.contributingSources] };

@Controller('api')
export class SnapshotController {
  constructor(
    @Inject(Orchestrator) private readonly orchestrator: Orchestrator,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Compose one snapshot from the three orchestrator accessors. No
   * I/O here — every field is read from in-memory runtime state.
   * The asset is already validated by `AssetParamPipe`, so by the
   * time we land in the body the parameter is a real `AssetId`.
   */
  @Get('snapshot')
  snapshot(@Query('asset', AssetParamPipe) asset: AssetId): GetSnapshotResponse {
    const correlationId = randomUUID();
    this.logger.info({ event: SNAPSHOT_EVENT, asset, correlationId }, 'Snapshot requested');
    return {
      asset,
      aggregate: toResponseAggregate(this.orchestrator.getSnapshot(asset)),
      // Spread to a fresh mutable array — same boundary-copy
      // reasoning as `toResponseAggregate`.
      sources: [...this.orchestrator.getSourceStates(asset)],
      breaker: this.orchestrator.getBreakerState(asset),
    };
  }
}
