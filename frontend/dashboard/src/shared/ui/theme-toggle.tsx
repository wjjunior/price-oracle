import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

import type { JSX } from 'react';

import { Button } from '@/shared/ui/button';

export function ThemeToggle(): JSX.Element {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon className="size-4" aria-hidden /> : <MoonIcon className="size-4" aria-hidden />}
    </Button>
  );
}
