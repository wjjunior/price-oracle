import { formatCurrency } from '@/shared/lib/format';

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

function toNumber(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'number' ? raw : Number(raw ?? 0);
}

export function formatTrendValue(value: unknown, name: unknown): [string, string] {
  if (name === 'confidence') return [`${(toNumber(value) * 100).toFixed(2)}%`, 'Confidence'];
  return [formatCurrency(toNumber(value)), 'Price'];
}

export function formatTrendTime(label: unknown): string {
  return new Date(Number(label)).toLocaleTimeString('en-GB', TIME_FORMAT);
}

export function formatTrendAxisPrice(value: unknown): string {
  return `$${Math.round(toNumber(value)).toLocaleString('en-US')}`;
}
