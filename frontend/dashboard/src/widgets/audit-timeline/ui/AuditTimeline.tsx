import { useState, type JSX } from 'react';

import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, Millis } from '@price-oracle/contracts/primitives';

import { AuditRow, auditEventKey, useAuditEvents } from '@/entities/audit-event';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

type Filter = 'all' | AssetId;
const FILTERS: readonly Filter[] = ['all', 'btc', 'eth'];

function matchesFilter(event: AuditEvent, filter: Filter): boolean {
  if (filter === 'all') return true;
  return 'asset' in event && event.asset === filter;
}

export function AuditTimeline({ now }: { readonly now: Millis }): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const events = useAuditEvents();
  const visible = events.filter((event) => matchesFilter(event, filter));

  return (
    <Card data-slot="audit-timeline" className="gap-3 p-4">
      <div data-slot="audit-filter" className="flex gap-1">
        {FILTERS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === filter ? 'default' : 'outline'}
            aria-pressed={option === filter}
            onClick={() => setFilter(option)}
          >
            {option.toUpperCase()}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((event) => (
          <AuditRow key={auditEventKey(event)} event={event} now={now} />
        ))}
      </div>
    </Card>
  );
}
