import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { type IngestorConfig, INGESTOR_CONFIG } from '../config/env.schema.js';
import { ChaosStateService } from '../mock/chaos-state.service.js';
import { TickGeneratorService } from '../mock/tick-generator.service.js';
import { NatsService } from '../nats/nats.service.js';

import { AdminController } from './admin.controller.js';
import { AssetParamPipe } from './asset-param.pipe.js';

const fakeConfig: IngestorConfig = {
  MOCK_HTTP_PORT: 7401,
  MOCK_TICK_INTERVAL_MS: 250,
  MOCK_BTC_ANCHOR_USD: 95_000,
  MOCK_ETH_ANCHOR_USD: 3_500,
  MOCK_PRICE_VOLATILITY_PCT: 0.001,
  NATS_URL: 'nats://localhost:4222',
  LOG_LEVEL: 'info',
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

  it('should respond 200 to POST /admin/btc/disconnect', async () => {
    await request(app.getHttpServer()).post('/admin/btc/disconnect').expect(200);
  });

  it('should respond 200 to POST /admin/eth/stale', async () => {
    await request(app.getHttpServer()).post('/admin/eth/stale').expect(200);
  });

  it('should respond 200 to POST /admin/btc/malformed', async () => {
    await request(app.getHttpServer()).post('/admin/btc/malformed').expect(200);
  });

  it('should respond 200 to POST /admin/btc/reset', async () => {
    await request(app.getHttpServer()).post('/admin/btc/reset').expect(200);
  });

  it('should respond 200 to POST /admin/reset-all', async () => {
    await request(app.getHttpServer()).post('/admin/reset-all').expect(200);
  });

  it('should respond 200 to GET /admin/status', async () => {
    await request(app.getHttpServer()).get('/admin/status').expect(200);
  });

  it('should respond 400 to a request for an unknown asset', async () => {
    await request(app.getHttpServer()).post('/admin/sol/disconnect').expect(400);
  });
});
