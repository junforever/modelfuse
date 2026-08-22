import { useRef, type ReactNode } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { useOptionalTheme } from '@workspace/ui/components/theme-provider';

interface AppShellProps {
  readonly sidebar: ReactNode;
  readonly children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const themeState = useOptionalTheme();
  const isDark =
    themeState?.theme === 'dark' ||
    (themeState?.theme !== 'light' &&
      (document.documentElement.classList.contains('dark') ||
        (!document.documentElement.classList.contains('light') &&
          (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false))));
  const nextTheme = isDark ? 'light' : 'dark';
  const themeLabel = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only fixed top-4 left-4 z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only"
        onClick={() => mainRef.current?.focus()}
      >
        Saltar al contenido principal
      </a>
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <p className="text-lg font-semibold">ModelFuse</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={themeLabel}
          aria-label={themeLabel}
          onClick={() => themeState?.setTheme(nextTheme)}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </header>
      <div className="grid min-h-[calc(100vh-3.5rem)] md:grid-cols-[18rem_1fr]">
        <aside className="border-b p-4 md:border-r md:border-b-0">{sidebar}</aside>
        <main
          ref={mainRef}
          id="main-content"
          aria-label="Contenido principal"
          tabIndex={-1}
          className="min-w-0 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
