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
    <Card data-slot="audit-timeline" className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <span className="font-mono text-xs uppercase tracking-[0.6px] text-muted-foreground">
          Audit Timeline
        </span>
        <Tabs value={filter} onValueChange={onValueChange}>
          <TabsList data-slot="audit-filter" className="h-7 rounded-full bg-muted p-0.5">
            {FILTERS.map((option) => (
              <TabsTrigger
                key={option}
                value={option}
                className="h-6 rounded-full px-3 text-[10px]"
              >
                {option.toUpperCase()}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea data-slot="audit-list" className="h-64 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {visible.length === 0 ? (
            <span className="px-2 py-3 text-sm text-muted-foreground">No events yet.</span>
          ) : (
            visible.map((event) => <AuditRow key={auditEventKey(event)} event={event} now={now} />)
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
