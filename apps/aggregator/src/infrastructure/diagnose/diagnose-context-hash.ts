import { createHash } from 'node:crypto';

import type { DiagnoseContext } from '../../domain/ports/diagnose.port.js';

const HASH_PREFIX_LENGTH = 16;

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

export function hashDiagnoseContext(context: DiagnoseContext): string {
  const sources = [...context.sources]
    .map((s) => `${s.source}:${s.health}:${s.lastTickAt ?? 'null'}:${s.lastPrice ?? 'null'}`)
    .sort(compareStrings);
  const events = [...context.recentEvents]
    .map((e) => JSON.stringify(e, Object.keys(e).sort(compareStrings)))
    .sort(compareStrings);
  const canonical = JSON.stringify({
    asset: context.asset,
    confidence: context.confidence,
    breaker: context.breaker,
    sources,
    events,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, HASH_PREFIX_LENGTH);
}
