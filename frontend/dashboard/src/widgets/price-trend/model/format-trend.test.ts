import { describe, expect, it } from 'vitest';

import { formatTrendAxisPrice, formatTrendTime } from './format-trend.js';

describe('formatTrendTime', () => {
  it('should render a 24-hour HH:MM tick label', () => {
    const at = Date.UTC(2026, 0, 1, 12, 7, 0);
    expect(formatTrendTime(at)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('should return a placeholder when the label is not a finite number', () => {
    expect(formatTrendTime(undefined)).toBe('—');
    expect(formatTrendTime('not a number')).toBe('—');
    expect(formatTrendTime(Number.NaN)).toBe('—');
  });
});

describe('formatTrendAxisPrice', () => {
  it('should render integer dollars with thousands separators', () => {
    expect(formatTrendAxisPrice(20_000)).toBe('$20,000');
  });

  it('should round to the nearest dollar', () => {
    expect(formatTrendAxisPrice(1_950.49)).toBe('$1,950');
  });
});
