import { describeAuditEvent } from '../model/describe.js';
import { ICON_FOR_EVENT } from '../model/event-icon.js';

import { AssetChip } from './AssetChip.js';

import type { AuditEvent } from '@price-oracle/contracts/events';
import type { Millis } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { formatRelativeTime } from '@/shared/lib/format';

export function AuditRow({
  event,
  now,
}: {
  readonly event: AuditEvent;
  readonly now: Millis;
}): JSX.Element {
  const Icon = ICON_FOR_EVENT[event.type];
  return (
    <div
      data-slot="audit-row"
      className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/40"
    >
      <Icon data-slot="audit-icon" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {'asset' in event ? <AssetChip asset={event.asset} /> : null}
          <span data-slot="audit-time" className="text-[10px] tabular-nums text-muted-foreground">
            {formatRelativeTime(event.at, now)}
          </span>
        </div>
        <span data-slot="audit-description" className="truncate text-xs leading-5 text-foreground/90">
          {describeAuditEvent(event)}
        </span>
      </div>
    </div>
  );
}
