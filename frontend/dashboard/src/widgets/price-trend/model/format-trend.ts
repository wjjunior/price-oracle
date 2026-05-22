import { formatCurrency } from '@/shared/lib/format';

function toNumber(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'number' ? raw : Number(raw ?? 0);
}

export function formatTrendValue(value: unknown, name: unknown): [string, string] {
  if (name === 'confidence') return [`${(toNumber(value) * 100).toFixed(1)}%`, 'Confidence'];
  if (name === 'band' && Array.isArray(value)) {
    return [`${formatCurrency(Number(value[0]))} – ${formatCurrency(Number(value[1]))}`, 'Uncertainty'];
  }
  return [formatCurrency(toNumber(value)), 'Price'];
}

export function formatTrendTime(label: unknown): string {
  return new Date(Number(label)).toLocaleTimeString();
}
