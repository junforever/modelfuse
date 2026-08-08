import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

interface HistoryTopSentinelProps {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly hasOlder: boolean;
  readonly isError: boolean;
  readonly isLoading: boolean;
  readonly onLoadOlder: () => void;
  readonly pageCount: number;
}

interface ScrollSnapshot {
  readonly pageCount: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}

export function HistoryTopSentinel({
  containerRef,
  hasOlder,
  isError,
  isLoading,
  onLoadOlder,
  pageCount,
}: HistoryTopSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<ScrollSnapshot | null>(null);

  function loadOlder() {
    const container = containerRef.current;
    if (!container || isLoading) return;
    snapshotRef.current = {
      pageCount,
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
    };
    onLoadOlder();
  }

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasOlder || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting) && !isError) loadOlder();
      },
      { root: containerRef.current }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  useLayoutEffect(() => {
    const snapshot = snapshotRef.current;
    const container = containerRef.current;
    if (!snapshot || !container || pageCount === snapshot.pageCount) return;

    container.scrollTop = snapshot.scrollTop + container.scrollHeight - snapshot.scrollHeight;
    snapshotRef.current = null;
  }, [containerRef, pageCount]);

  if (!hasOlder && !isError) return null;

  return (
    <div className="grid gap-2">
      <div ref={sentinelRef} aria-label="Cargar turnos anteriores" className="h-px" />
      {isLoading && (
        <p role="status" aria-label="Cargando turnos anteriores" className="text-sm text-muted-foreground">
          Cargando turnos anteriores…
        </p>
      )}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription className="grid gap-2">
            No se pudieron cargar turnos anteriores.
            <Button variant="outline" size="sm" onClick={loadOlder}>
              Reintentar historial
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
