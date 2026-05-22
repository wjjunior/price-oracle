import {
  buildAnomalyDetectedEvent,
  buildBreakerStateChangedEvent,
  buildDiagnoseAnsweredEvent,
  buildDiagnoseRequestedEvent,
  buildSourceStateChangedEvent,
} from '@price-oracle/contracts/events';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuditRow } from './AuditRow.js';

import type { AuditEvent } from '@price-oracle/contracts/events';

const ICON_CASES: ReadonlyArray<{ readonly label: string; readonly event: AuditEvent; readonly icon: string }> = [
  {
    label: 'SourceStateChanged',
    event: buildSourceStateChangedEvent({ asset: 'btc', source: 'binance', from: 'HEALTHY', to: 'DEGRADED', at: 1_000 }),
    icon: 'lucide-activity',
  },
  {
    label: 'BreakerStateChanged',
    event: buildBreakerStateChangedEvent({ asset: 'btc', from: 'CLOSED', to: 'OPEN', reason: 'low confidence', at: 1_000 }),
    icon: 'lucide-zap',
  },
  {
    label: 'AnomalyDetected',
    event: buildAnomalyDetectedEvent({ asset: 'eth', source: 'mock', metric: 'price-drift', value: 0.012, threshold: 0.005, at: 1_000 }),
    icon: 'lucide-triangle-alert',
  },
  {
    label: 'DiagnoseRequested',
    event: buildDiagnoseRequestedEvent({ asset: 'btc', trigger: 'operator', at: 1_000 }),
    icon: 'lucide-sparkles',
  },
  {
    label: 'DiagnoseAnswered',
    event: buildDiagnoseAnsweredEvent({ asset: 'btc', latencyMs: 1_200, at: 1_000 }),
    icon: 'lucide-message-square',
  },
];

describe('AuditRow', () => {
  it('should render the description, BTC asset chip and relative time', () => {
    const event = buildSourceStateChangedEvent({ asset: 'btc', source: 'binance', from: 'HEALTHY', to: 'DEGRADED', at: 1_000 });
    render(<AuditRow event={event} now={4_000} />);
    expect(screen.getByText('binance HEALTHY → DEGRADED')).toBeInTheDocument();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('should render the ETH asset chip', () => {
    const event = buildAnomalyDetectedEvent({ asset: 'eth', source: 'mock', metric: 'price-drift', value: 0.012, threshold: 0.005, at: 1_000 });
    render(<AuditRow event={event} now={1_000} />);
    expect(screen.getByText('ETH')).toBeInTheDocument();
  });

  for (const { label, event, icon } of ICON_CASES) {
    it(`should render the ${label} icon`, () => {
      const { container } = render(<AuditRow event={event} now={1_000} />);
      expect(container.querySelector('[data-slot="audit-icon"]')?.getAttribute('class')).toContain(icon);
    });
  }
});
