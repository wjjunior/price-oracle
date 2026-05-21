import type { JSX } from 'react';

import '@/app/theme.css';

import { Providers } from '@/app/providers';
import { DashboardPage } from '@/pages/dashboard';

export function App(): JSX.Element {
  return (
    <Providers>
      <DashboardPage />
    </Providers>
  );
}
