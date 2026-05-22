import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { Orchestrator } from '../application/orchestrator.js';
import {
  DiagnoseRateLimitedError,
  DiagnoseUnavailableError,
} from '../domain/ports/diagnose.port.js';

import { DiagnoseController } from './diagnose.controller.js';

import type { AuditPort } from '../domain/ports/audit.port.js';
import type { DiagnosePort, DiagnoseResult } from '../domain/ports/diagnose.port.js';
import type { HttpException } from '@nestjs/common';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { Logger } from 'pino';

const makeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn() }) as unknown as Logger;

const fakeOrchestrator = (): Orchestrator =>
  ({
    getSnapshot: () => ({
      asset: 'btc',
      price: 50_000,
      confidence: 0.42,
      contributingSources: ['binance'],
      computedAt: 1_000_000,
    }),
    getBreakerState: () => 'CLOSED',
    getSourceStates: () => [],
  }) as unknown as Orchestrator;

type Harness = {
  controller: DiagnoseController;
  appended: AuditEvent[];
  diagnose: ReturnType<typeof vi.fn>;
};

const setup = (diagnoseImpl: DiagnosePort['diagnose']): Harness => {
  const appended: AuditEvent[] = [];
  const append = vi.fn<AuditPort['append']>(async (e) => {
    appended.push(e);
  });
  const recent = vi.fn<AuditPort['recent']>().mockResolvedValue([]);
  const lastKnownAggregate = vi.fn<AuditPort['lastKnownAggregate']>().mockResolvedValue(null);
  const audit: AuditPort = { append, recent, lastKnownAggregate };
  const diagnose = vi.fn<DiagnosePort['diagnose']>(diagnoseImpl);
  const port: DiagnosePort = { diagnose };
  const controller = new DiagnoseController(fakeOrchestrator(), port, audit, makeLogger());
  return { controller, appended, diagnose };
};

const isHttpException = (error: unknown): error is HttpException =>
  typeof error === 'object' && error !== null && 'getStatus' in error;

describe('DiagnoseController', () => {
  it('should return markdown and emit DiagnoseRequested then DiagnoseAnswered', async () => {
    const result: DiagnoseResult = { markdown: '# diagnosis', latencyMs: 12, tokensUsed: 100 };
    const h = setup(() => Promise.resolve(result));

    const response = await h.controller.requestDiagnose('btc', { trigger: 'operator' });

    expect(response.markdown).toBe('# diagnosis');
    expect(response.latencyMs).toBe(12);
    expect(response.tokensUsed).toBe(100);
    expect(h.appended.map((e) => e.type)).toEqual(['DiagnoseRequested', 'DiagnoseAnswered']);
  });

  it('should map DiagnoseRateLimitedError to a 429 with retryAfterMs', async () => {
    const h = setup(() => Promise.reject(new DiagnoseRateLimitedError(5_000)));

    try {
      await h.controller.requestDiagnose('btc', {});
      expect.unreachable('expected a rate-limit exception');
    } catch (error) {
      if (!isHttpException(error)) throw error;
      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.getResponse()).toEqual({ error: 'rate_limited', retryAfterMs: 5_000 });
    }
  });

  it('should map DiagnoseUnavailableError to a 503', async () => {
    const h = setup(() => Promise.reject(new DiagnoseUnavailableError('no client')));

    try {
      await h.controller.requestDiagnose('btc', {});
      expect.unreachable('expected an unavailable exception');
    } catch (error) {
      if (!isHttpException(error)) throw error;
      expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(error.getResponse()).toEqual({ error: 'diagnose_unavailable' });
    }
  });
});
