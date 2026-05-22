import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConfidenceBar } from './ConfidenceBar.js';

function fill(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-slot="confidence-fill"]');
}

describe('ConfidenceBar', () => {
  it('should render an em dash and a zero-width fill when confidence is unavailable', () => {
    const { container } = render(<ConfidenceBar confidence={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(fill(container)?.style.width).toBe('0%');
  });

  it('should size the fill to the rounded confidence percentage', () => {
    const { container } = render(<ConfidenceBar confidence={0.95} />);
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(fill(container)?.style.width).toBe('95%');
  });

  it('should tag the fill HIGH at or above the high threshold', () => {
    const { container } = render(<ConfidenceBar confidence={0.8} />);
    expect(fill(container)?.getAttribute('data-level')).toBe('HIGH');
  });

  it('should tag the fill DEGRADED between thresholds', () => {
    const { container } = render(<ConfidenceBar confidence={0.5} />);
    expect(fill(container)?.getAttribute('data-level')).toBe('DEGRADED');
  });

  it('should tag the fill UNAVAILABLE below the degraded threshold', () => {
    const { container } = render(<ConfidenceBar confidence={0.2} />);
    expect(fill(container)?.getAttribute('data-level')).toBe('UNAVAILABLE');
  });
});
