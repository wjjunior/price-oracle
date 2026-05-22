import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { Orchestrator } from '../application/orchestrator.js';
import { AUDIT_PORT } from '../domain/ports/audit.port.js';
import {
  DIAGNOSE_PORT,
  DiagnoseRateLimitedError,
  DiagnoseUnavailableError,
} from '../domain/ports/diagnose.port.js';

import { AssetParamPipe } from './asset-param.pipe.js';
import { AuditLimitPipe } from './audit-limit.pipe.js';
import { AuditController } from './audit.controller.js';
import { DiagnoseBodyPipe } from './diagnose-body.pipe.js';
import { DiagnoseController } from './diagnose.controller.js';
import { OptionalAssetParamPipe } from './optional-asset-param.pipe.js';
import { SnapshotController } from './snapshot.controller.js';
import { LOGGER } from './tokens.js';

import type { DiagnosePort, DiagnoseResult } from '../domain/ports/diagnose.port.js';
import type { INestApplication } from '@nestjs/common';
import type { Logger } from 'pino';

const logger = { info: vi.fn(), warn: vi.fn() } as unknown as Logger;

const orchestrator = {
  getSnapshot: () => null,
  getSourceStates: () => [],
  getBreakerState: () => 'CLOSED',
} as unknown as Orchestrator;

const audit = {
  append: vi.fn().mockResolvedValue(undefined),
  recent: vi.fn().mockResolvedValue([]),
  lastKnownAggregate: vi.fn().mockResolvedValue(null),
};

const diagnoseResult: DiagnoseResult = { markdown: '# ok', latencyMs: 7 };
let diagnoseImpl: () => Promise<DiagnoseResult>;
const diagnose: DiagnosePort = {
  diagnose: () => diagnoseImpl(),
};

const buildApp = async (): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    controllers: [SnapshotController, AuditController, DiagnoseController],
    providers: [
      AssetParamPipe,
      OptionalAssetParamPipe,
      AuditLimitPipe,
      DiagnoseBodyPipe,
      { provide: Orchestrator, useValue: orchestrator },
      { provide: AUDIT_PORT, useValue: audit },
      { provide: DIAGNOSE_PORT, useValue: diagnose },
      { provide: LOGGER, useValue: logger },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
};

describe('Aggregator HTTP', () => {
  let app: INestApplication;

  beforeEach(async () => {
    diagnoseImpl = () => Promise.resolve(diagnoseResult);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should respond 200 to GET /api/snapshot?asset=btc', () => {
    return request(app.getHttpServer()).get('/api/snapshot?asset=btc').expect(200);
  });

  it('should respond 400 to GET /api/snapshot for an unknown asset', () => {
    return request(app.getHttpServer()).get('/api/snapshot?asset=sol').expect(400);
  });

  it('should respond 200 to GET /api/audit', () => {
    return request(app.getHttpServer()).get('/api/audit?asset=btc&limit=10').expect(200);
  });

  it('should respond 200 to POST /api/diagnose?asset=btc', () => {
    return request(app.getHttpServer()).post('/api/diagnose?asset=btc').send({}).expect(200);
  });

  it('should respond 429 when diagnose is rate limited', () => {
    diagnoseImpl = () => Promise.reject(new DiagnoseRateLimitedError(3_000));
    return request(app.getHttpServer()).post('/api/diagnose?asset=btc').send({}).expect(429);
  });

  it('should respond 503 when diagnose is unavailable', () => {
    diagnoseImpl = () => Promise.reject(new DiagnoseUnavailableError('down'));
    return request(app.getHttpServer()).post('/api/diagnose?asset=btc').send({}).expect(503);
  });
});
