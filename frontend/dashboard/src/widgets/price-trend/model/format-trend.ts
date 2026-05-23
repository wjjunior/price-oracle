const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

const UNKNOWN_TIME = '—';

export function formatTrendTime(label: unknown): string {
  const ms = typeof label === 'number' ? label : Number(label);
  if (!Number.isFinite(ms)) return UNKNOWN_TIME;
  return new Date(ms).toLocaleTimeString('en-GB', TIME_FORMAT);
}

export function formatTrendAxisPrice(value: unknown): string {
  const raw = typeof value === 'number' ? value : Number(value ?? 0);
  return `$${Math.round(raw).toLocaleString('en-US')}`;
}
