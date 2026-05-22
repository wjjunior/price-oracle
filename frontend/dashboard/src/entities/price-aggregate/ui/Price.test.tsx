import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Price } from './Price.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';

const aggregate = (asset: AssetId, confidence: number): AggregatePrice => ({
  asset,
  price: 65_000,
  confidence,
  contributingSources: ['binance'],
  computedAt: 1,
});

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

describe('Price', () => {
  for (const asset of ASSETS) {
    it(`should render an exact currency string at HIGH confidence for ${asset}`, () => {
      render(<Price aggregate={aggregate(asset, 0.95)} />);
      expect(screen.getByText('$65,000.00')).toHaveAttribute('data-severity', 'HIGH');
    });

    it(`should render a tilde-prefixed string at DEGRADED confidence for ${asset}`, () => {
      render(<Price aggregate={aggregate(asset, 0.6)} />);
      expect(screen.getByText('~$65,000.00')).toHaveAttribute('data-severity', 'DEGRADED');
    });

    it(`should render an em dash at UNAVAILABLE confidence for ${asset}`, () => {
      render(<Price aggregate={aggregate(asset, 0.3)} />);
      expect(screen.getByText('—')).toHaveAttribute('data-severity', 'UNAVAILABLE');
    });
  }

  it('should render an em dash when the aggregate is null', () => {
    render(<Price aggregate={null} />);
    expect(screen.getByText('—')).toHaveAttribute('data-severity', 'UNAVAILABLE');
  });
});
