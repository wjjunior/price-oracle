import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiagnoseCard } from './DiagnoseCard.js';

describe('DiagnoseCard', () => {
  it('should render the empty state and request a diagnosis on click', () => {
    const onRequest = vi.fn();
    render(<DiagnoseCard state="empty" onRequest={onRequest} />);

    expect(screen.getByText(/request a diagnosis/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('should render the loading state with a disabled trigger', () => {
    const { container } = render(<DiagnoseCard state="loading" />);
    expect(container.querySelector('[data-slot="diagnose-loading"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Diagnose' })).toBeDisabled();
  });

  it('should render the answered Markdown response', async () => {
    render(<DiagnoseCard state="answered" markdown={'## Diagnosis\n\nConfidence is low for BTC.'} />);
    expect(await screen.findByRole('heading', { name: 'Diagnosis' })).toBeInTheDocument();
    expect(screen.getByText('Confidence is low for BTC.')).toBeInTheDocument();
  });
});
