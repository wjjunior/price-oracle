import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { AdminController } from './admin.controller.js';
import { AdminModule } from './admin.module.js';

describe('AdminModule.register', () => {
  it('should mount the chaos controller when enabled', () => {
    expect(AdminModule.register(true).controllers).toContain(AdminController);
  });

  it('should mount no controllers when disabled', () => {
    expect(AdminModule.register(false).controllers ?? []).toEqual([]);
  });
});

describe('AdminModule disabled (no env guard)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('should not expose the chaos endpoints when disabled', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdminModule.register(false)],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/admin/btc/stale').expect(404);
    await request(app.getHttpServer()).post('/admin/reset-all').expect(404);
  });
});
