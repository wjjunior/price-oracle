import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type IngestorConfig, INGESTOR_CONFIG } from '../config/env.schema.js';
import { ChaosMode } from '../mock/chaos-mode.js';
import { ChaosStateService } from '../mock/chaos-state.service.js';
import { TickGeneratorService } from '../mock/tick-generator.service.js';
import { NatsService } from '../nats/nats.service.js';

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

describe('AdminController', () => {
  let chaos: ChaosStateService;
  let generator: { lastPublished: ReturnType<typeof vi.fn> };
  let controller: AdminController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    chaos = new ChaosStateService();
    generator = {
      lastPublished: vi.fn().mockReturnValue({ price: 95_000, sourceTimestamp: 1_699_999_999_000 }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AssetParamPipe,
        { provide: ChaosStateService, useValue: chaos },
        { provide: TickGeneratorService, useValue: generator },
        { provide: INGESTOR_CONFIG, useValue: fakeConfig },
        { provide: NatsService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(AdminController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return disconnected state on disconnect', () => {
    const res = controller.disconnect('btc');
    expect(res).toEqual({ asset: 'btc', mode: ChaosMode.DISCONNECTED, since: 1_700_000_000_000 });
    expect(chaos.get('btc').mode).toBe(ChaosMode.DISCONNECTED);
  });

  it('should be idempotent: repeated disconnect returns original since', () => {
    controller.disconnect('btc');
    vi.setSystemTime(new Date(1_700_000_001_000));
    const res = controller.disconnect('btc');
    expect(res.since).toBe(1_700_000_000_000);
  });

  it('should snapshot last published price when setting stale', () => {
    const res = controller.stale('btc');
    expect(res).toEqual({
      asset: 'btc',
      mode: ChaosMode.STALE,
      since: 1_700_000_000_000,
      frozenPrice: 95_000,
    });
    expect(generator.lastPublished).toHaveBeenCalledWith('btc');
  });

  it('should fall back to anchor price when no tick has been published yet', () => {
    generator.lastPublished.mockReturnValue(null);
    const res = controller.stale('eth');
    expect(res.frozenPrice).toBe(3_500);
  });

  it('should return malformed state on malformed', () => {
    const res = controller.malformed('btc');
    expect(res.mode).toBe(ChaosMode.MALFORMED);
  });

  it('should reset an asset back to healthy', () => {
    controller.disconnect('btc');
    const res = controller.reset('btc');
    expect(res.mode).toBe(ChaosMode.HEALTHY);
  });

  it('should restore both assets on reset-all', () => {
    controller.disconnect('btc');
    controller.malformed('eth');
    const res = controller.resetAll();
    expect(res.states).toHaveLength(2);
    expect(res.states.every((s) => s.mode === ChaosMode.HEALTHY)).toBe(true);
  });

  it('should expose current effective state on GET /admin/status', () => {
    controller.disconnect('btc');
    const res = controller.status();
    expect(res.states.find((s) => s.asset === 'btc')?.mode).toBe(ChaosMode.DISCONNECTED);
    expect(res.states.find((s) => s.asset === 'eth')?.mode).toBe(ChaosMode.HEALTHY);
  });
});

describe('AssetParamPipe', () => {
  it('should return the asset when valid', () => {
    const pipe = new AssetParamPipe();
    expect(pipe.transform('btc')).toBe('btc');
    expect(pipe.transform('eth')).toBe('eth');
  });

  it('should throw 400 on unknown asset', () => {
    const pipe = new AssetParamPipe();
    expect(() => pipe.transform('sol')).toThrow();
  });
});
