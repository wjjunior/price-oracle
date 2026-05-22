import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChaosControls } from './ChaosControls.js';

const noop = (): void => {};

describe('ChaosControls', () => {
  it('should fire onAction with the asset and scenario', () => {
    const onAction = vi.fn();
    render(<ChaosControls onAction={onAction} onResetAll={noop} pending={new Set()} />);

    const btcGroup = document.querySelector('[data-slot="chaos-asset"][data-asset="btc"]') as HTMLElement;
    fireEvent.click(within(btcGroup).getByRole('button', { name: 'stale' }));

    expect(onAction).toHaveBeenCalledWith('btc', 'stale');
  });

  it('should fire onResetAll from the global reset', () => {
    const onResetAll = vi.fn();
    render(<ChaosControls onAction={noop} onResetAll={onResetAll} pending={new Set()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  it('should disable only the in-flight per-asset action', () => {
    render(<ChaosControls onAction={noop} onResetAll={noop} pending={new Set(['btc:disconnect'])} />);

    const btcGroup = document.querySelector('[data-slot="chaos-asset"][data-asset="btc"]') as HTMLElement;
    const ethGroup = document.querySelector('[data-slot="chaos-asset"][data-asset="eth"]') as HTMLElement;
    expect(within(btcGroup).getByRole('button', { name: 'disconnect' })).toBeDisabled();
    expect(within(btcGroup).getByRole('button', { name: 'stale' })).toBeEnabled();
    expect(within(ethGroup).getByRole('button', { name: 'disconnect' })).toBeEnabled();
  });

  it('should only target the mock — no real ingestors are represented', () => {
    render(<ChaosControls onAction={noop} onResetAll={noop} pending={new Set()} />);
    expect(screen.queryByText('binance')).toBeNull();
    expect(screen.queryByText('coinbase')).toBeNull();
  });
});
