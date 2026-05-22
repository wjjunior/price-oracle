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

  @Get('snapshot')
  snapshot(@Query('asset', AssetParamPipe) asset: AssetId): GetSnapshotResponse {
    const correlationId = randomUUID();
    this.logger.info({ event: SNAPSHOT_EVENT, asset, correlationId }, 'Snapshot requested');
    return {
      asset,
      aggregate: toResponseAggregate(this.orchestrator.getSnapshot(asset)),
      sources: [...this.orchestrator.getSourceStates(asset)],
      breaker: this.orchestrator.getBreakerState(asset),
    };
  }
}
