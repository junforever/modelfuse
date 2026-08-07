import { useRef, type ReactNode } from 'react';

interface AppShellProps {
  readonly sidebar: ReactNode;
  readonly children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only"
        onClick={() => mainRef.current?.focus()}
      >
        Saltar al contenido principal
      </a>
      <header className="border-b px-4 py-3 sm:px-6">
        <p className="text-lg font-semibold">ModelFuse</p>
      </header>
      <div className="grid min-h-[calc(100vh-3.5rem)] md:grid-cols-[18rem_1fr]">
        <aside className="border-b p-4 md:border-b-0 md:border-r">{sidebar}</aside>
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
