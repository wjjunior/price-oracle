import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardPage } from './dashboard-page.js';

import type { RenderResult } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';

const WIDGET_SLOTS = [
  'price-overview',
  'source-health',
  'audit-timeline',
  'diagnose-panel',
  'chaos-controls',
] as const;

function renderPage(): RenderResult {
  const client = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DashboardPage />, { wrapper: Wrapper });
}

describe('DashboardPage', () => {
  it('should render the dashboard heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Price Oracle' })).toBeInTheDocument();
  });

  it('should compose all five operator widgets', () => {
    const { container } = renderPage();
    for (const slot of WIDGET_SLOTS) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
  });
});
