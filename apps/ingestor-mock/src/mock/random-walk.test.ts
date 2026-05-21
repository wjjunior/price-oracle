import { describe, expect, it } from 'vitest';

import { nextPrice } from './random-walk.js';

describe('nextPrice', () => {
  it('should stay within volatility band for a single step', () => {
    const prev = 100;
    const volatilityPct = 0.01;
    const upper = prev * (1 + volatilityPct);
    const lower = prev * (1 - volatilityPct);

    for (let i = 0; i < 1000; i += 1) {
      const result = nextPrice(prev, { volatilityPct, rand: Math.random });
      expect(result).toBeGreaterThanOrEqual(lower);
      expect(result).toBeLessThanOrEqual(upper);
    }
  });

  it('should be deterministic given the same rand sequence', () => {
    const seq = [0.1, 0.9, 0.5];
    let i = 0;
    const rand = (): number => seq[i++ % seq.length]!;
    const a = nextPrice(100, { volatilityPct: 0.01, rand });
    i = 0;
    const b = nextPrice(100, { volatilityPct: 0.01, rand });
    expect(a).toBe(b);
  });

  it('should return prev when rand returns 0.5 (no delta)', () => {
    const result = nextPrice(100, { volatilityPct: 0.01, rand: () => 0.5 });
    expect(result).toBe(100);
  });
});
