import type { Millis } from '@price-oracle/contracts/primitives';

export const STALE_DISPLAY_AFTER_MS = 10_000;

export function formatSourceLatency(lastTickAt: Millis | null, now: Millis): string {
  if (lastTickAt === null) return 'never';
  const age = Math.max(0, now - lastTickAt);
  if (age >= STALE_DISPLAY_AFTER_MS) return `stale ${Math.round(age / 1000)} s`;
  if (age < 100) return '< 100 ms';
  return `${(age / 1000).toFixed(1)} s`;
}
