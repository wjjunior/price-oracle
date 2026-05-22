import { describe, expect, it, vi } from 'vitest';

import { AuditLimitPipe, DEFAULT_AUDIT_LIMIT, MAX_AUDIT_LIMIT } from './audit-limit.pipe.js';
import { AuditController } from './audit.controller.js';
import { OptionalAssetParamPipe } from './optional-asset-param.pipe.js';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { Logger } from 'pino';

const makeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn() }) as unknown as Logger;

const event: AuditEvent = {
  type: 'BreakerStateChanged',
  asset: 'btc',
  from: 'CLOSED',
  to: 'OPEN',
  reason: 'confidence 0.10 below floor',
  at: 1_000_000,
};

describe('AuditController', () => {
  it('should return recent events and pass the limit and asset filter to the port', async () => {
    const recent = vi.fn<AuditPort['recent']>().mockResolvedValue([event]);
    const audit = { recent } as unknown as AuditPort;
    const controller = new AuditController(audit, makeLogger());

    const response = await controller.recentAudit(25, 'btc');

    expect(response.events).toEqual([event]);
    expect(recent).toHaveBeenCalledWith(25, 'btc');
  });

  it('should pass undefined when no asset filter is given', async () => {
    const recent = vi.fn<AuditPort['recent']>().mockResolvedValue([]);
    const audit = { recent } as unknown as AuditPort;
    const controller = new AuditController(audit, makeLogger());

    await controller.recentAudit(DEFAULT_AUDIT_LIMIT, undefined);

    expect(recent).toHaveBeenCalledWith(DEFAULT_AUDIT_LIMIT, undefined);
  });

  it('should default the limit when the query param is absent', () => {
    expect(new AuditLimitPipe().transform(undefined)).toBe(DEFAULT_AUDIT_LIMIT);
  });

  it('should clamp the limit to the maximum', () => {
    expect(new AuditLimitPipe().transform('5000')).toBe(MAX_AUDIT_LIMIT);
  });

  it('should fall back to the default for a non-numeric limit', () => {
    expect(new AuditLimitPipe().transform('not-a-number')).toBe(DEFAULT_AUDIT_LIMIT);
  });

  it('should reject an unknown asset filter at the pipe boundary', () => {
    expect(() => new OptionalAssetParamPipe().transform('sol')).toThrow();
  });

  it('should allow an absent asset filter at the pipe boundary', () => {
    expect(new OptionalAssetParamPipe().transform(undefined)).toBeUndefined();
  });
});
