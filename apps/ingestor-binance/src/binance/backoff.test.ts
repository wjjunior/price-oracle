import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BACKOFF,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  nextDelayMs,
} from './backoff.js';

const noJitter = () => 0.5;

describe('nextDelayMs', () => {
  it('should return the base delay on attempt 0 with no jitter', () => {
    expect(nextDelayMs(0, DEFAULT_BACKOFF, noJitter)).toBe(DEFAULT_BACKOFF_BASE_MS);
  });

  it('should grow exponentially before reaching the cap', () => {
    expect(nextDelayMs(1, DEFAULT_BACKOFF, noJitter)).toBe(DEFAULT_BACKOFF_BASE_MS * 2);
    expect(nextDelayMs(2, DEFAULT_BACKOFF, noJitter)).toBe(DEFAULT_BACKOFF_BASE_MS * 4);
    expect(nextDelayMs(3, DEFAULT_BACKOFF, noJitter)).toBe(DEFAULT_BACKOFF_BASE_MS * 8);
  });

  it('should cap at maxMs for large attempts', () => {
    expect(nextDelayMs(20, DEFAULT_BACKOFF, noJitter)).toBe(DEFAULT_BACKOFF_MAX_MS);
  });

  it('should apply the lower jitter bound when rng returns 0', () => {
    expect(nextDelayMs(0, DEFAULT_BACKOFF, () => 0)).toBe(
      DEFAULT_BACKOFF_BASE_MS * (1 - DEFAULT_BACKOFF.jitterRatio),
    );
  });

  it('should apply the upper jitter bound when rng returns 1', () => {
    expect(nextDelayMs(0, DEFAULT_BACKOFF, () => 1)).toBe(
      DEFAULT_BACKOFF_BASE_MS * (1 + DEFAULT_BACKOFF.jitterRatio),
    );
  });

  it('should never return below 0 or above the cap', () => {
    for (const attempt of [0, 1, 5, 20, 100]) {
      for (const r of [0, 0.25, 0.5, 0.75, 1]) {
        const delay = nextDelayMs(attempt, DEFAULT_BACKOFF, () => r);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(DEFAULT_BACKOFF_MAX_MS);
      }
    }
  });

  it('should treat negative attempts as 0', () => {
    expect(nextDelayMs(-3, DEFAULT_BACKOFF, noJitter)).toBe(DEFAULT_BACKOFF_BASE_MS);
  });
});
