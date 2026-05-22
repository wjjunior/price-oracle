import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Price } from './Price.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';

const aggregate = (confidence: number): AggregatePrice => ({
  asset: 'btc',
  price: 65_000,
  confidence,
  contributingSources: ['binance'],
  computedAt: 1,
});

describe('Price', () => {
  it('should render an exact currency string at HIGH confidence', () => {
    render(<Price aggregate={aggregate(0.95)} />);
    expect(screen.getByText('$65,000.00')).toBeInTheDocument();
  });

  it('should render a tilde-prefixed string at DEGRADED confidence', () => {
    render(<Price aggregate={aggregate(0.6)} />);
    expect(screen.getByText('~$65,000.00')).toBeInTheDocument();
  });

  it('should render an em dash when the aggregate is unavailable', () => {
    render(<Price aggregate={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should expose the severity as a data attribute', () => {
    render(<Price aggregate={aggregate(0.95)} />);
    expect(screen.getByText('$65,000.00')).toHaveAttribute('data-severity', 'HIGH');
  });
});
