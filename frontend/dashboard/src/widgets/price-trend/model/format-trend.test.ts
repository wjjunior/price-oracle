import { describe, expect, it } from 'vitest';

import { formatTrendAxisPrice, formatTrendTime, formatTrendValue } from './format-trend.js';

import { formatCurrency } from '@/shared/lib/format';

describe('formatTrendValue', () => {
  it('should format confidence as a two-decimal percentage', () => {
    expect(formatTrendValue(0.9833, 'confidence')).toEqual(['98.33%', 'Confidence']);
  });

  it('should format price as currency', () => {
    expect(formatTrendValue(76_050.31, 'price')).toEqual([formatCurrency(76_050.31), 'Price']);
  });

  it('should unwrap an array value before formatting', () => {
    expect(formatTrendValue([0.6], 'confidence')).toEqual(['60.00%', 'Confidence']);
  });
});

describe('formatTrendTime', () => {
  it('should render a 24-hour HH:MM tick label', () => {
    const at = Date.UTC(2026, 0, 1, 12, 7, 0);
    expect(formatTrendTime(at)).toMatch(/^\d{2}:\d{2}$/);
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
