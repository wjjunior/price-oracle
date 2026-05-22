import { buildSourceStateChangedEvent } from '@price-oracle/contracts/events';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuditTimeline } from './AuditTimeline.js';

import { seedAuditEvents } from '@/entities/audit-event';
import { useAuditStore } from '@/entities/audit-event/model/audit-store';


beforeEach(() => useAuditStore.setState({ events: [] }));

describe('AuditTimeline', () => {
  it('should filter events by asset and reflect the choice immediately', () => {
    seedAuditEvents({
      events: [
        buildSourceStateChangedEvent({ asset: 'btc', source: 'binance', from: 'HEALTHY', to: 'DEGRADED', at: 2_000 }),
        buildSourceStateChangedEvent({ asset: 'eth', source: 'mock', from: 'HEALTHY', to: 'STALE', at: 1_000 }),
      ],
    });

    render(<AuditTimeline now={3_000} />);
    expect(screen.getByText('binance HEALTHY → DEGRADED')).toBeInTheDocument();
    expect(screen.getByText('mock HEALTHY → STALE')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ETH' }));

    expect(screen.queryByText('binance HEALTHY → DEGRADED')).toBeNull();
    expect(screen.getByText('mock HEALTHY → STALE')).toBeInTheDocument();
  });
});
