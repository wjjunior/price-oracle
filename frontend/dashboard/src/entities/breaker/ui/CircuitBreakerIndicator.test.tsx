import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CircuitBreakerIndicator } from './CircuitBreakerIndicator.js';

describe('CircuitBreakerIndicator', () => {
  it('should render CLOSED with brand styling and no pulse', () => {
    const { container } = render(<CircuitBreakerIndicator state="CLOSED" />);
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('should label HALF_OPEN as HALF-OPEN', () => {
    render(<CircuitBreakerIndicator state="HALF_OPEN" />);
    expect(screen.getByText('HALF-OPEN')).toBeInTheDocument();
  });

  it('should pulse and label OPEN', () => {
    const { container } = render(<CircuitBreakerIndicator state="OPEN" />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('should expose the raw state via data-state', () => {
    const { container } = render(<CircuitBreakerIndicator state="OPEN" />);
    expect(container.querySelector('[data-slot="breaker-indicator"]')?.getAttribute('data-state')).toBe(
      'OPEN',
    );
  });
});
