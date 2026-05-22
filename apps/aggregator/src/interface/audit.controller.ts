import { randomUUID } from 'node:crypto';

import { Controller, Get, Inject, Query } from '@nestjs/common';

import { AUDIT_PORT } from '../domain/ports/audit.port.js';

import { AuditLimitPipe } from './audit-limit.pipe.js';
import { OptionalAssetParamPipe } from './optional-asset-param.pipe.js';
import { LOGGER } from './tokens.js';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { AssetId } from '@price-oracle/contracts/primitives';
import type { GetAuditResponse } from '@price-oracle/contracts/rest';
import type { Logger } from 'pino';

const AUDIT_EVENT = 'http.audit';

@Controller('api')
export class AuditController {
  constructor(
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Get('audit')
  async recentAudit(
    @Query('limit', AuditLimitPipe) limit: number,
    @Query('asset', OptionalAssetParamPipe) asset: AssetId | undefined,
  ): Promise<GetAuditResponse> {
    const correlationId = randomUUID();
    this.logger.info({ event: AUDIT_EVENT, asset, correlationId, limit }, 'Audit requested');
    const events = await this.audit.recent(limit, asset);
    return { events: [...events] };
  }
}
