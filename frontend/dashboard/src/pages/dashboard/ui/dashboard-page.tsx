import { useDashboardData } from '../model/use-dashboard-data.js';

import { DiagnosePanel } from './DiagnosePanel.js';

import type { JSX } from 'react';

import { InjectFailureDialog, useInjectFailure } from '@/features/inject-failure';
import { useNow } from '@/shared/lib/use-now';
import { AuditTimeline } from '@/widgets/audit-timeline';
import { ChaosControls } from '@/widgets/chaos-controls';
import { PriceOverview } from '@/widgets/price-overview';
import { SourceHealth } from '@/widgets/source-health';

export function DashboardPage(): JSX.Element {
  const { connectionState } = useDashboardData();
  const now = useNow();
  const inject = useInjectFailure();
  const reconnecting = connectionState === 'reconnecting' || connectionState === 'closed';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <header className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Price Oracle</h1>
            {reconnecting ? (
              <span data-slot="sse-status" className="text-xs font-medium text-degraded">
                Reconnecting…
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Confidence-aware multi-source price feed — operator dashboard
          </p>
        </header>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <PriceOverview />
          </div>
          <div className="lg:col-span-2">
            <SourceHealth now={now} />
          </div>
          <div className="lg:col-span-1">
            <DiagnosePanel />
          </div>
          <div className="lg:col-span-2">
            <AuditTimeline now={now} />
          </div>
          <div className="lg:col-span-1">
            <ChaosControls
              onAction={inject.request}
              onResetAll={inject.requestResetAll}
              pending={inject.pending}
            />
          </div>
        </div>
        <InjectFailureDialog
          target={inject.confirmTarget}
          onConfirm={inject.confirm}
          onCancel={inject.cancel}
        />
      </div>
    </main>
  );
}
