import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PriceTrend } from './PriceTrend.js';

import { usePriceHistoryStore } from '@/entities/price-aggregate/model/history-store';

beforeEach(() => usePriceHistoryStore.setState({ byAsset: { btc: [], eth: [] } }));

describe('PriceTrend', () => {
  it('should render a trend card for each asset', () => {
    render(<PriceTrend />);
    expect(document.querySelector('[data-slot="price-trend"][data-asset="btc"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="price-trend"][data-asset="eth"]')).not.toBeNull();
  });

  it('should show a waiting state until points arrive', () => {
    render(<PriceTrend />);
    expect(screen.getAllByText('Waiting for data…')).toHaveLength(2);
  });
});
