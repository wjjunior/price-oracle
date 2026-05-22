import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PriceOverview } from './PriceOverview.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';

import { hydrateFromSnapshot } from '@/entities/price-aggregate';


const aggregate = (asset: AssetId, price: number, confidence: number): AggregatePrice => ({
  asset,
  price,
  confidence,
  contributingSources: ['binance'],
  computedAt: 1,
});

beforeEach(() => {
  hydrateFromSnapshot({ asset: 'btc', aggregate: null, sources: [], breaker: 'CLOSED' });
  hydrateFromSnapshot({ asset: 'eth', aggregate: null, sources: [], breaker: 'CLOSED' });
});

describe('PriceOverview', () => {
  it('should render BTC and ETH prices independently per asset confidence', () => {
    hydrateFromSnapshot({ asset: 'btc', aggregate: aggregate('btc', 65_000, 0.95), sources: [], breaker: 'CLOSED' });
    hydrateFromSnapshot({ asset: 'eth', aggregate: aggregate('eth', 3_400, 0.6), sources: [], breaker: 'CLOSED' });

    render(<PriceOverview />);

    expect(screen.getByText('$65,000.00')).toBeInTheDocument();
    expect(screen.getByText('~$3,400.00')).toBeInTheDocument();
  });

  it('should stack on small viewports and split into two columns from the md breakpoint', () => {
    const { container } = render(<PriceOverview />);
    const overview = container.querySelector('[data-slot="price-overview"]');
    expect(overview?.className).toContain('grid-cols-1');
    expect(overview?.className).toContain('md:grid-cols-2');
  });
});
