import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardPage } from './dashboard-page.js';

describe('DashboardPage', () => {
  it('should render the dashboard heading', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Price Oracle' })).toBeInTheDocument();
  });

  it('should render a shadcn button', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
  });
});
