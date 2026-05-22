import {
  ActivityIcon,
  MessageSquareIcon,
  SparklesIcon,
  TriangleAlertIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';

import type { AuditEvent } from '@price-oracle/contracts/events';

export const ICON_FOR_EVENT: Record<AuditEvent['type'], LucideIcon> = {
  SourceStateChanged: ActivityIcon,
  BreakerStateChanged: ZapIcon,
  AnomalyDetected: TriangleAlertIcon,
  DiagnoseRequested: SparklesIcon,
  DiagnoseAnswered: MessageSquareIcon,
};
