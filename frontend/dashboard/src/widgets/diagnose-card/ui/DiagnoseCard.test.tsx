import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiagnoseCard } from './DiagnoseCard.js';

const baseProps = {
  asset: 'btc' as const,
  confidence: 0.95,
  onAssetChange: () => {},
};

describe('DiagnoseCard', () => {
  it('should render the empty state and trigger onRequest when clicked', () => {
    const onRequest = vi.fn();
    render(<DiagnoseCard {...baseProps} state="empty" onRequest={onRequest} />);

    expect(screen.getByText(/click diagnose to generate/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('should render the loading state with a disabled trigger', () => {
    const { container } = render(
      <DiagnoseCard {...baseProps} state="loading" onRequest={() => {}} />,
    );
    expect(container.querySelector('[data-slot="diagnose-loading"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Diagnose' })).toBeDisabled();
  });

  it('should render the answered Markdown response with the asset health footer', async () => {
    render(
      <DiagnoseCard
        {...baseProps}
        state="answered"
        markdown={'## Diagnosis\n\nConfidence is high for BTC.'}
        onRequest={() => {}}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Diagnosis' })).toBeInTheDocument();
    expect(screen.getByText('Confidence is high for BTC.')).toBeInTheDocument();
    expect(screen.getByText('BTC Price Feed Health Report')).toBeInTheDocument();
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
  });

  it('should label the footer as STALE when confidence is missing', () => {
    render(
      <DiagnoseCard
        {...baseProps}
        confidence={null}
        state="answered"
        markdown={'## report'}
        onRequest={() => {}}
      />,
    );
    expect(screen.getByText('STALE')).toBeInTheDocument();
  });
});
