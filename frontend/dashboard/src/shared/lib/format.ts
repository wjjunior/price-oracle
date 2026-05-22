export type ConfidenceLevel = 'HIGH' | 'DEGRADED' | 'UNAVAILABLE';

const JUST_NOW_MAX_SECONDS = 5;
const UNAVAILABLE = '—';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return usd.format(value);
}

export function formatPrice(value: number | null, level: ConfidenceLevel): string {
  if (value === null || level === 'UNAVAILABLE') return UNAVAILABLE;
  if (level === 'DEGRADED') return `~${formatCurrency(value)}`;
  return formatCurrency(value);
}

export function formatRelativeTime(fromMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - fromMs) / 1000);
  if (seconds < JUST_NOW_MAX_SECONDS) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return '1d+ ago';
}

export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
