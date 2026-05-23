const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

export function formatTrendTime(label: unknown): string {
  return new Date(Number(label)).toLocaleTimeString('en-GB', TIME_FORMAT);
}

export function formatTrendAxisPrice(value: unknown): string {
  const raw = typeof value === 'number' ? value : Number(value ?? 0);
  return `$${Math.round(raw).toLocaleString('en-US')}`;
}
