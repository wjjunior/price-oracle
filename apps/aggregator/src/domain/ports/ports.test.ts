import { describe, expect, expectTypeOf, it } from 'vitest';

import { AUDIT_PORT, type AuditPort } from './audit.port.js';
import { DIAGNOSE_PORT } from './diagnose.port.js';
import { PUBLISH_PORT } from './publish.port.js';
import { SOURCE_STREAM_PORT } from './source-stream.port.js';

import type { AssetId } from '@price-oracle/contracts/primitives';

describe('aggregator port tokens', () => {
  it('should expose a distinct DI symbol per port', () => {
    const tokens = [SOURCE_STREAM_PORT, PUBLISH_PORT, AUDIT_PORT, DIAGNOSE_PORT];
    for (const token of tokens) {
      expect(typeof token).toBe('symbol');
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

describe('AuditPort', () => {
  it('should parameterize lastKnownAggregate by asset', () => {
    expectTypeOf<AuditPort['lastKnownAggregate']>().parameters.toEqualTypeOf<[AssetId]>();
  });
});
