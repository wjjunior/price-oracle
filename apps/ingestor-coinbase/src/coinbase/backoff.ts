export const DEFAULT_BACKOFF_BASE_MS = 1_000;
export const DEFAULT_BACKOFF_MAX_MS = 30_000;
export const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;

export type BackoffConfig = {
  baseMs: number;
  maxMs: number;
  jitterRatio: number;
};

export const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: DEFAULT_BACKOFF_BASE_MS,
  maxMs: DEFAULT_BACKOFF_MAX_MS,
  jitterRatio: DEFAULT_BACKOFF_JITTER_RATIO,
};

export function nextDelayMs(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(0, attempt);
  const exponential = config.baseMs * 2 ** safeAttempt;
  const capped = Math.min(exponential, config.maxMs);
  const jitter = capped * config.jitterRatio * (random() * 2 - 1);
  return Math.min(config.maxMs, Math.max(0, capped + jitter));
}
