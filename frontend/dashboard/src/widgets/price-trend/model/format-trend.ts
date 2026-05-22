import { formatCurrency } from '@/shared/lib/format';

export function formatTrendValue(value: unknown, name: unknown): [string, string] {
  const raw = Array.isArray(value) ? value[0] : value;
  const num = typeof raw === 'number' ? raw : Number(raw ?? 0);
  if (name === 'confidence') return [`${(num * 100).toFixed(1)}%`, 'Confidence'];
  return [formatCurrency(num), 'Price'];
}

export function formatTrendTime(label: unknown): string {
  return new Date(Number(label)).toLocaleTimeString();
}
