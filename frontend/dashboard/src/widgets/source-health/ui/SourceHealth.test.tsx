import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SourceHealth } from './SourceHealth.js';

import type { SourceState } from '@price-oracle/contracts/events';
import type { AssetId, SourceId } from '@price-oracle/contracts/primitives';

import { hydrateFromSnapshot } from '@/entities/source';
import { useSourceStore } from '@/entities/source/model/source-store';


const sourceState = (asset: AssetId, source: SourceId, health: SourceState['health']): SourceState => ({
  asset,
  source,
  health,
  lastTickAt: 1_000,
  lastPrice: 65_000,
  pendingHealth: null,
  pendingStreak: 0,
});

beforeEach(() => useSourceStore.setState({ byAsset: { btc: {}, eth: {} } }));

describe('SourceHealth', () => {
  it('should group source rows under their asset', () => {
    hydrateFromSnapshot({
      asset: 'btc',
      aggregate: null,
      sources: [sourceState('btc', 'binance', 'HEALTHY'), sourceState('btc', 'coinbase', 'DEGRADED')],
      breaker: 'CLOSED',
    });
    hydrateFromSnapshot({
      asset: 'eth',
      aggregate: null,
      sources: [sourceState('eth', 'mock', 'STALE')],
      breaker: 'CLOSED',
    });

    render(<SourceHealth now={1_050} />);

    const btcGroup = document.querySelector('[data-slot="source-group"][data-asset="btc"]');
    const ethGroup = document.querySelector('[data-slot="source-group"][data-asset="eth"]');
    expect(within(btcGroup as HTMLElement).getByText('binance')).toBeInTheDocument();
    expect(within(btcGroup as HTMLElement).getByText('coinbase')).toBeInTheDocument();
    expect(within(ethGroup as HTMLElement).getByText('mock')).toBeInTheDocument();
    expect(within(ethGroup as HTMLElement).queryByText('binance')).toBeNull();
  });

  it('should show an empty message for an asset with no reporting sources', () => {
    render(<SourceHealth now={1_050} />);
    expect(screen.getAllByText('No sources reporting')).toHaveLength(2);
  });
});
