import { describe, expect, it } from 'vitest';

import { DiagnoseRateLimitedError, DiagnoseUnavailableError } from './diagnose.port.js';

describe('DiagnoseRateLimitedError', () => {
  it('should be an Error carrying retryAfterMs', () => {
    const err = new DiagnoseRateLimitedError(2_500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DiagnoseRateLimitedError);
    expect(err.retryAfterMs).toBe(2_500);
    expect(err.name).toBe('DiagnoseRateLimitedError');
  });
});

describe('DiagnoseUnavailableError', () => {
  it('should preserve its message and cause', () => {
    const cause = new Error('boom');
    const err = new DiagnoseUnavailableError('llm failed', { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DiagnoseUnavailableError);
    expect(err.message).toBe('llm failed');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('DiagnoseUnavailableError');
  });
});
