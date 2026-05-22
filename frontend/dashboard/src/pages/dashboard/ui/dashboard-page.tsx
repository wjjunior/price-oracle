import { useState, type JSX } from 'react';

import { AuditTimeline } from '@/widgets/audit-timeline';
import { ChaosControls } from '@/widgets/chaos-controls';
import { DiagnoseCard } from '@/widgets/diagnose-card';
import { PriceOverview } from '@/widgets/price-overview';
import { SourceHealth } from '@/widgets/source-health';

const NO_PENDING: ReadonlySet<string> = new Set();
const noop = (): void => {};

export function DashboardPage(): JSX.Element {
  const [now] = useState(() => Date.now());
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Price Oracle</h1>
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
            <DiagnoseCard state="empty" />
          </div>
          <div className="lg:col-span-2">
            <AuditTimeline now={now} />
          </div>
          <div className="lg:col-span-1">
            <ChaosControls onAction={noop} onResetAll={noop} pending={NO_PENDING} />
          </div>
        </div>
      </div>
    </main>
  );
}
