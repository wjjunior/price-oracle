import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import request from 'supertest';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { type IngestorConfig, INGESTOR_CONFIG } from '../config/env.schema.js';
import { ChaosStateService } from '../mock/chaos-state.service.js';
import { TickGeneratorService } from '../mock/tick-generator.service.js';

import { AdminController } from './admin.controller.js';
import { AssetParamPipe } from './asset-param.pipe.js';

const fakeConfig: IngestorConfig = {
  httpPort: 7401,
  tickIntervalMs: 250,
  btcAnchorUsd: 95_000,
  ethAnchorUsd: 3_500,
  priceVolatilityPct: 0.001,
  adminEnabled: true,
  natsUrl: 'nats://localhost:4222',
};

describe('Admin HTTP', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AssetParamPipe,
        { provide: ChaosStateService, useValue: new ChaosStateService() },
        {
          provide: TickGeneratorService,
          useValue: { lastPublished: vi.fn().mockReturnValue(null) },
        },
        { provide: INGESTOR_CONFIG, useValue: fakeConfig },
        { provide: NatsService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should respond 200 to POST /admin/btc/disconnect', () => {
    return request(app.getHttpServer()).post('/admin/btc/disconnect').expect(200);
  });

  it('should respond 200 to POST /admin/eth/stale', () => {
    return request(app.getHttpServer()).post('/admin/eth/stale').expect(200);
  });

  it('should respond 200 to POST /admin/btc/malformed', () => {
    return request(app.getHttpServer()).post('/admin/btc/malformed').expect(200);
  });

  it('should respond 200 to POST /admin/btc/reset', () => {
    return request(app.getHttpServer()).post('/admin/btc/reset').expect(200);
  });

  it('should respond 200 to POST /admin/reset-all', () => {
    return request(app.getHttpServer()).post('/admin/reset-all').expect(200);
  });

  it('should respond 200 to GET /admin/status', () => {
    return request(app.getHttpServer()).get('/admin/status').expect(200);
  });

  it('should respond 400 to a request for an unknown asset', () => {
    return request(app.getHttpServer()).post('/admin/sol/disconnect').expect(400);
  });
});
