import type { BreakerState, SourceState } from '../types.js';
import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, Confidence } from '@price-oracle/contracts/primitives';

export type DiagnoseContext = {
  readonly asset: AssetId;
  readonly confidence: Confidence;
  readonly breaker: BreakerState;
  readonly recentEvents: readonly AuditEvent[];
  readonly sources: readonly SourceState[];
};

export type DiagnoseResult = {
  readonly markdown: string;
  readonly latencyMs: number;
  readonly tokensUsed?: number;
};

export interface DiagnosePort {
  diagnose(context: DiagnoseContext): Promise<DiagnoseResult>;
}

export const DIAGNOSE_PORT = Symbol.for('@price-oracle/aggregator/diagnose-port');

export class DiagnoseRateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('diagnose rate limit exceeded');
    this.name = 'DiagnoseRateLimitedError';
  }
}

export class DiagnoseUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DiagnoseUnavailableError';
  }
}
