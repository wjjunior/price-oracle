import {
  ActivityIcon,
  MessageSquareIcon,
  SparklesIcon,
  TriangleAlertIcon,
  ZapIcon,
} from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { ICON_FOR_EVENT } from './event-icon.js';

describe('ICON_FOR_EVENT', () => {
  it('should map each audit event variant to its icon', () => {
    expect(ICON_FOR_EVENT.SourceStateChanged).toBe(ActivityIcon);
    expect(ICON_FOR_EVENT.BreakerStateChanged).toBe(ZapIcon);
    expect(ICON_FOR_EVENT.AnomalyDetected).toBe(TriangleAlertIcon);
    expect(ICON_FOR_EVENT.DiagnoseRequested).toBe(SparklesIcon);
    expect(ICON_FOR_EVENT.DiagnoseAnswered).toBe(MessageSquareIcon);
  });
});
