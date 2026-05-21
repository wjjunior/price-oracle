import type { Millis } from '../primitives.js';

export const computeFreshness = (now: Millis, lastTickAt: Millis, decayMs: Millis): number => {
  const age = now - lastTickAt;
  if (age <= 0) return 1;
  if (age >= decayMs) return 0;
  return 1 - age / decayMs;
};
