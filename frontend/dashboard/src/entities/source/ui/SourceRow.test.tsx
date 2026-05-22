import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SourceRow } from './SourceRow.js';

import type { SourceState } from '@price-oracle/contracts/events';

const sourceState = (overrides: Partial<SourceState> = {}): SourceState => ({
  asset: 'btc',
  source: 'binance',
  health: 'HEALTHY',
  lastTickAt: 1_000,
  lastPrice: 65_000,
  pendingHealth: null,
  pendingStreak: 0,
  ...overrides,
});

describe('SourceRow', () => {
  it('should render the source name, health, latency and last price', () => {
    render(<SourceRow state={sourceState()} now={1_050} />);
    expect(screen.getByText('binance')).toBeInTheDocument();
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
    expect(screen.getByText('< 100 ms')).toBeInTheDocument();
    expect(screen.getByText('$65,000.00')).toBeInTheDocument();
  });

  it('should color the health label from the typed health enum', () => {
    render(<SourceRow state={sourceState({ health: 'STALE' })} now={1_050} />);
    expect(screen.getByText('STALE').className).toContain('text-stale');
  });

  it('should render placeholders for a never-seen source without crashing', () => {
    render(<SourceRow state={sourceState({ lastTickAt: null, lastPrice: null })} now={5_000} />);
    expect(screen.getByText('never')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
