import { describe, expect, it } from 'vitest';

import { formatSourceLatency } from './format-latency.js';

describe('formatSourceLatency', () => {
  it('should render "never" when the source has no last tick', () => {
    expect(formatSourceLatency(null, 1_000)).toBe('never');
  });

  it('should render "< 100 ms" for a fresh sub-100ms age', () => {
    expect(formatSourceLatency(1_000, 1_050)).toBe('< 100 ms');
  });

  it('should render seconds with one decimal between 100ms and the stale window', () => {
    expect(formatSourceLatency(0, 500)).toBe('0.5 s');
    expect(formatSourceLatency(0, 1_200)).toBe('1.2 s');
  });

  it('should prefix "stale" once the age reaches the display window', () => {
    expect(formatSourceLatency(0, 12_000)).toBe('stale 12 s');
  });

  it('should clamp a future last tick to a non-negative age without crashing', () => {
    expect(formatSourceLatency(2_000, 1_000)).toBe('< 100 ms');
  });
});
