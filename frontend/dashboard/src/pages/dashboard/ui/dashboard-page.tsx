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

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

function BrandMark(): JSX.Element {
  return (
    <span aria-hidden className="flex h-9 w-5 items-center">
      <span className="flex h-8 w-full items-center gap-1">
        <span className="h-full w-2 rounded-sm bg-brand" />
        <span className="h-full flex-1 rounded-sm bg-brand-light" />
      </span>
    </span>
  );
}

export function DashboardPage(): JSX.Element {
  const { connectionState } = useDashboardData();
  const now = useNow();
  const inject = useInjectFailure();
  const reconnecting = connectionState === 'reconnecting' || connectionState === 'closed';
  const datetime = new Date(now).toLocaleString('en-US', DATETIME_FORMAT);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1512px] flex-col gap-4 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-start gap-3">
            <BrandMark />
            <div className="flex flex-col">
              <h1 className="text-2xl font-medium leading-9 tracking-tight text-foreground">
                Price Oracle
              </h1>
              <p className="text-sm leading-5 text-muted-foreground">
                Confidence-aware multi-source price feed — operator dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {reconnecting ? (
              <span data-slot="sse-status" className="text-xs font-medium text-degraded">
                Reconnecting…
              </span>
            ) : null}
            <ThemeToggle />
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{datetime}</span>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <PriceOverview />
            <Suspense fallback={<div className="h-64" />}>
              <PriceTrend />
            </Suspense>
            <SourceHealth now={now} />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <DiagnosePanel />
            <ChaosControls
              onAction={inject.request}
              onResetAll={inject.requestResetAll}
              pending={inject.pending}
            />
          </div>
          <div className="lg:col-span-12">
            <AuditTimeline now={now} />
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
