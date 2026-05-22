import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CircuitBreakerIndicator } from './CircuitBreakerIndicator.js';

describe('CircuitBreakerIndicator', () => {
  it('should label a CLOSED breaker as live without a pulse', () => {
    const { container } = render(<CircuitBreakerIndicator state="CLOSED" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('should label a HALF_OPEN breaker as recovering', () => {
    render(<CircuitBreakerIndicator state="HALF_OPEN" />);
    expect(screen.getByText('Recovering')).toBeInTheDocument();
  });

  it('should label an OPEN breaker as suppressed and pulse', () => {
    const { container } = render(<CircuitBreakerIndicator state="OPEN" />);
    expect(screen.getByText('Suppressed')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('should expose the raw state via data attribute for operators', () => {
    const { container } = render(<CircuitBreakerIndicator state="OPEN" />);
    expect(container.querySelector('[data-slot="breaker-indicator"]')?.getAttribute('data-state')).toBe(
      'OPEN',
    );
  });
});
