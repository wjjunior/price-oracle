import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { buildDiagnoseAnsweredEvent, buildDiagnoseRequestedEvent } from '@price-oracle/contracts/events';

import { Orchestrator } from '../application/orchestrator.js';
import { AUDIT_PORT } from '../domain/ports/audit.port.js';
import {
  DIAGNOSE_PORT,
  DiagnoseRateLimitedError,
  DiagnoseUnavailableError,
} from '../domain/ports/diagnose.port.js';

import { AssetParamPipe } from './asset-param.pipe.js';
import { DiagnoseBodyPipe } from './diagnose-body.pipe.js';
import { LOGGER } from './tokens.js';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { DiagnoseContext, DiagnosePort } from '../domain/ports/diagnose.port.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, CorrelationId } from '@price-oracle/contracts/primitives';
import type { PostDiagnoseRequest, PostDiagnoseResponse } from '@price-oracle/contracts/rest';
import type { Logger } from 'pino';

const DIAGNOSE_EVENT = 'http.diagnose';
const DEFAULT_TRIGGER = 'manual';
const RECENT_EVENTS_LIMIT = 20;
const RATE_LIMITED_ERROR = 'rate_limited';
const UNAVAILABLE_ERROR = 'diagnose_unavailable';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : inspect(error);

@Controller('api')
export class DiagnoseController {
  constructor(
    @Inject(Orchestrator) private readonly orchestrator: Orchestrator,
    @Inject(DIAGNOSE_PORT) private readonly diagnose: DiagnosePort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Post('diagnose')
  async requestDiagnose(
    @Query('asset', AssetParamPipe) asset: AssetId,
    @Body(DiagnoseBodyPipe) body: PostDiagnoseRequest,
  ): Promise<PostDiagnoseResponse> {
    const correlationId: CorrelationId = randomUUID();
    this.logger.info({ event: DIAGNOSE_EVENT, asset, correlationId }, 'Diagnose requested');

    const recentEvents = await this.audit.recent(RECENT_EVENTS_LIMIT, asset);
    const context: DiagnoseContext = {
      asset,
      confidence: this.orchestrator.getSnapshot(asset)?.confidence ?? 0,
      breaker: this.orchestrator.getBreakerState(asset),
      recentEvents,
      sources: [...this.orchestrator.getSourceStates(asset)],
    };

    await this.appendBestEffort(
      buildDiagnoseRequestedEvent({ asset, trigger: body.trigger ?? DEFAULT_TRIGGER, at: Date.now() }),
      correlationId,
    );

    const result = await this.runDiagnose(context, asset, correlationId);

    await this.appendBestEffort(
      buildDiagnoseAnsweredEvent({
        asset,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed,
        at: Date.now(),
      }),
      correlationId,
    );

    return {
      asset,
      markdown: result.markdown,
      latencyMs: result.latencyMs,
      tokensUsed: result.tokensUsed,
      generatedAt: Date.now(),
    };
  }

  private async runDiagnose(
    context: DiagnoseContext,
    asset: AssetId,
    correlationId: CorrelationId,
  ): Promise<Awaited<ReturnType<DiagnosePort['diagnose']>>> {
    try {
      return await this.diagnose.diagnose(context);
    } catch (error) {
      if (error instanceof DiagnoseRateLimitedError) {
        this.logger.info(
          { event: DIAGNOSE_EVENT, asset, correlationId, outcome: RATE_LIMITED_ERROR },
          'Diagnose rate limited',
        );
        throw new HttpException(
          { error: RATE_LIMITED_ERROR, retryAfterMs: error.retryAfterMs },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof DiagnoseUnavailableError) {
        this.logger.warn(
          { event: DIAGNOSE_EVENT, asset, correlationId, error: errorMessage(error) },
          'Diagnose unavailable',
        );
        throw new HttpException(
          { error: UNAVAILABLE_ERROR },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }

  private async appendBestEffort(event: AuditEvent, correlationId: CorrelationId): Promise<void> {
    try {
      await this.audit.append(event);
    } catch (error) {
      this.logger.warn(
        {
          event: 'http.diagnose.audit-failed',
          auditType: event.type,
          asset: event.asset,
          correlationId,
          error: errorMessage(error),
        },
        'Diagnose audit append failed',
      );
    }
  }
}
