import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardPage } from './dashboard-page.js';

const WIDGET_SLOTS = [
  'price-overview',
  'source-health',
  'audit-timeline',
  'diagnose-card',
  'chaos-controls',
] as const;

describe('DashboardPage', () => {
  it('should render the dashboard heading', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Price Oracle' })).toBeInTheDocument();
  });

  it('should compose all five operator widgets', () => {
    const { container } = render(<DashboardPage />);
    for (const slot of WIDGET_SLOTS) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
  });
});
