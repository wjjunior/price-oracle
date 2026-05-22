import { describe, expect, it } from 'vitest';

import { formatCurrency, formatLatency, formatPrice, formatRelativeTime } from './format.js';

describe('formatCurrency', () => {
  it('should render a USD amount with two fraction digits and grouping', () => {
    expect(formatCurrency(65_000)).toBe('$65,000.00');
    expect(formatCurrency(95_432.1)).toBe('$95,432.10');
  });
});

describe('formatPrice', () => {
  it('should render a plain currency string at HIGH confidence', () => {
    expect(formatPrice(65_000, 'HIGH')).toBe('$65,000.00');
  });

  it('should prefix a tilde at DEGRADED confidence', () => {
    expect(formatPrice(65_000, 'DEGRADED')).toBe('~$65,000.00');
  });

  it('should render an em dash at UNAVAILABLE confidence', () => {
    expect(formatPrice(65_000, 'UNAVAILABLE')).toBe('—');
  });

  it('should render an em dash when the value is null regardless of level', () => {
    expect(formatPrice(null, 'HIGH')).toBe('—');
  });
});

describe('formatRelativeTime', () => {
  it('should render "just now" within the just-now window', () => {
    expect(formatRelativeTime(10_000, 12_000)).toBe('just now');
  });

  it('should render seconds, minutes and hours as they accumulate', () => {
    expect(formatRelativeTime(0, 30_000)).toBe('30s ago');
    expect(formatRelativeTime(0, 5 * 60_000)).toBe('5m ago');
    expect(formatRelativeTime(0, 3 * 3_600_000)).toBe('3h ago');
  });

  it('should treat a future timestamp as "just now"', () => {
    expect(formatRelativeTime(20_000, 10_000)).toBe('just now');
  });
});

describe('formatLatency', () => {
  it('should render sub-second latency in milliseconds', () => {
    expect(formatLatency(200)).toBe('200ms');
  });

  it('should render second-scale latency with one decimal', () => {
    expect(formatLatency(1_250)).toBe('1.3s');
  });
});
