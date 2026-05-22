import type { AuditEvent } from '@price-oracle/contracts/events';

export function describeAuditEvent(event: AuditEvent): string {
  switch (event.type) {
    case 'SourceStateChanged':
      return `${event.source} ${event.from} → ${event.to}`;
    case 'BreakerStateChanged':
      return `breaker ${event.from} → ${event.to}`;
    case 'AnomalyDetected':
      return `${event.metric} ${event.value} > ${event.threshold}`;
    case 'DiagnoseRequested':
      return `diagnose requested (${event.trigger})`;
    case 'DiagnoseAnswered':
      return `diagnose answered (${event.latencyMs} ms)`;
  }
}
