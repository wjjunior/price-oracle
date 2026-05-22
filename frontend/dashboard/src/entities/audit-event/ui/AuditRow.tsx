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
    <div data-slot="audit-row" className="flex items-center gap-2 text-sm">
      <Icon data-slot="audit-icon" className="size-4 shrink-0 text-muted-foreground" />
      {'asset' in event ? <AssetChip asset={event.asset} /> : null}
      <span data-slot="audit-description" className="flex-1 truncate">
        {describeAuditEvent(event)}
      </span>
      <span data-slot="audit-time" className="text-xs text-muted-foreground tabular-nums">
        {formatRelativeTime(event.at, now)}
      </span>
    </div>
  );
}
