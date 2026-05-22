import { describe, expect, it } from 'vitest';

import { formatTrendTime, formatTrendValue } from './format-trend.js';

import { formatCurrency } from '@/shared/lib/format';

describe('formatTrendValue', () => {
  it('should format confidence as a one-decimal percentage', () => {
    expect(formatTrendValue(0.983, 'confidence')).toEqual(['98.3%', 'Confidence']);
  });

  it('should format price as currency', () => {
    expect(formatTrendValue(76_050.31, 'price')).toEqual([formatCurrency(76_050.31), 'Price']);
  });

  it('should unwrap an array value before formatting', () => {
    expect(formatTrendValue([0.6], 'confidence')).toEqual(['60.0%', 'Confidence']);
  });

  it('should format the uncertainty band as a currency range', () => {
    expect(formatTrendValue([59_000, 61_000], 'band')).toEqual([
      `${formatCurrency(59_000)} – ${formatCurrency(61_000)}`,
      'Uncertainty',
    ]);
  });
});

describe('formatTrendTime', () => {
  it('should render the point timestamp as a local time string', () => {
    const at = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(formatTrendTime(at)).toBe(new Date(at).toLocaleTimeString());
  });
});
