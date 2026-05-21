import type { JSX } from 'react';

import { Button } from '@/shared/ui/button';

export function DashboardPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Price Oracle</h1>
          <p className="text-sm text-muted-foreground">
            Confidence-aware multi-source price feed — operator dashboard
          </p>
        </header>
        <section className="rounded-lg border bg-card p-6 text-card-foreground">
          <p className="text-sm text-muted-foreground">
            Dashboard shell ready. Widgets land in subsequent slices.
          </p>
          <div className="mt-4">
            <Button>Get started</Button>
          </div>
        </section>
      </div>
    </main>
  );
}
