import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InjectFailureDialog } from './InjectFailureDialog.js';

const noop = (): void => {};

describe('InjectFailureDialog', () => {
  it('should stay closed when there is no target', () => {
    render(<InjectFailureDialog target={null} onConfirm={noop} onCancel={noop} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should describe the pending action and confirm it', () => {
    const onConfirm = vi.fn();
    render(
      <InjectFailureDialog
        target={{ kind: 'asset', asset: 'eth', scenario: 'stale' }}
        onConfirm={onConfirm}
        onCancel={noop}
      />,
    );
    expect(screen.getByText(/inject "stale" on the mock eth feed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should cancel the pending action', () => {
    const onCancel = vi.fn();
    render(
      <InjectFailureDialog target={{ kind: 'reset-all' }} onConfirm={noop} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
