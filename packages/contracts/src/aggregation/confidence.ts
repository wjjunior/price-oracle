import type { Confidence } from '../primitives.js';

export const computeConfidence = (
  freshness: number,
  agreement: number,
  coverage: number,
): Confidence => freshness * agreement * coverage;
