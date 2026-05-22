import {
  buildAnomalyDetectedEvent,
  buildSourceStateChangedEvent,
} from '@price-oracle/contracts/events';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuditRow } from './AuditRow.js';

describe('AuditRow', () => {
  it('should render the description, asset chip and relative time', () => {
    const event = buildSourceStateChangedEvent({
      asset: 'btc',
      source: 'binance',
      from: 'HEALTHY',
      to: 'DEGRADED',
      at: 1_000,
    });
    render(<AuditRow event={event} now={4_000} />);
    expect(screen.getByText('binance HEALTHY → DEGRADED')).toBeInTheDocument();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('should render the variant-specific icon', () => {
    const event = buildAnomalyDetectedEvent({
      asset: 'eth',
      source: 'mock',
      metric: 'price-drift',
      value: 0.012,
      threshold: 0.005,
      at: 1_000,
    });
    const { container } = render(<AuditRow event={event} now={1_000} />);
    expect(container.querySelector('[data-slot="audit-icon"]')?.getAttribute('class')).toContain(
      'lucide-triangle-alert',
    );
  });
});
