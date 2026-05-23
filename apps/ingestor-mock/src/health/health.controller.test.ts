import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('should return ok with the ingestor-mock service name and a non-negative uptime', () => {
    const controller = new HealthController();
    const response = controller.health();
    expect(response.status).toBe('ok');
    expect(response.service).toBe('ingestor-mock');
    expect(response.uptimeMs).toBeGreaterThanOrEqual(0);
  });
});
