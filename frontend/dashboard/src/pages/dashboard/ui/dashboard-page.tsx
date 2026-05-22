import { ActivityIcon, ClockIcon } from 'lucide-react';
import { lazy, Suspense, type JSX } from 'react';

import { useDashboardData } from '../model/use-dashboard-data.js';

import { DiagnosePanel } from './DiagnosePanel.js';

import { InjectFailureDialog, useInjectFailure } from '@/features/inject-failure';
import { useNow } from '@/shared/lib/use-now';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { AuditTimeline } from '@/widgets/audit-timeline';
import { ChaosControls } from '@/widgets/chaos-controls';
import { PriceOverview } from '@/widgets/price-overview';
import { SourceHealth } from '@/widgets/source-health';

const PriceTrend = lazy(() =>
  import('@/widgets/price-trend').then((module) => ({ default: module.PriceTrend })),
);

export function DashboardPage(): JSX.Element {
  const { connectionState } = useDashboardData();
  const now = useNow();
  const inject = useInjectFailure();
  const reconnecting = connectionState === 'reconnecting' || connectionState === 'closed';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand text-white">
              <ActivityIcon className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col">
              <h1 className="text-xl font-semibold tracking-tight">Price Oracle</h1>
              <p className="text-xs text-muted-foreground">
                Confidence-aware multi-source price feed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {reconnecting ? (
              <span data-slot="sse-status" className="text-xs font-medium text-degraded">
                Reconnecting…
              </span>
            ) : null}
            <span className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
              <ClockIcon className="size-4" aria-hidden />
              {new Date(now).toLocaleTimeString()}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <PriceOverview />
          </div>
          <div className="lg:col-span-3">
            <Suspense fallback={<div className="h-40" />}>
              <PriceTrend />
            </Suspense>
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
