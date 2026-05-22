import { useState, type JSX } from 'react';

import type { AuditEvent } from '@price-oracle/contracts/events';
import type { AssetId, Millis } from '@price-oracle/contracts/primitives';

import { AuditRow, auditEventKey, useAuditEvents } from '@/entities/audit-event';
import { Card } from '@/shared/ui/card';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';

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

  const onValueChange = (value: string): void => {
    const next = FILTERS.find((option) => option === value);
    if (next) setFilter(next);
  };

  return (
    <Card data-slot="audit-timeline" className="gap-3 p-4">
      <Tabs value={filter} onValueChange={onValueChange}>
        <TabsList data-slot="audit-filter" className="w-full">
          {FILTERS.map((option) => (
            <TabsTrigger key={option} value={option} className="flex-1">
              {option.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ScrollArea data-slot="audit-list" className="h-80 pr-3">
        <div className="flex flex-col gap-1">
          {visible.length === 0 ? (
            <span className="text-sm text-muted-foreground">No events yet.</span>
          ) : (
            visible.map((event) => <AuditRow key={auditEventKey(event)} event={event} now={now} />)
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
