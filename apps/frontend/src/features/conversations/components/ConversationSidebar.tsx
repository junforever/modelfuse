import { useEffect, useRef } from 'react';

import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

import type { ConversationSummary } from '../types/conversation';
import { ConversationMenu } from './ConversationMenu';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface ConversationSidebarProps {
  readonly conversations: readonly ConversationSummary[];
  readonly hasMore: boolean;
  readonly incrementalError: boolean;
  readonly isError: boolean;
  readonly isLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly onDelete: (conversationId: string) => Promise<void>;
  readonly onDeleted?: (conversationId: string) => void;
  readonly onLoadMore: () => void;
  readonly onNewConversation: () => void;
  readonly onRename: (conversationId: string, title: string) => Promise<ConversationSummary>;
  readonly onRenamed?: (conversation: ConversationSummary) => void;
  readonly onRetry: () => void;
  readonly onSelect: (conversationId: string) => void;
  readonly selectedConversationId: string | null;
}

export function ConversationSidebar({
  conversations,
  hasMore,
  incrementalError,
  isError,
  isLoading,
  isLoadingMore,
  onDelete,
  onDeleted,
  onLoadMore,
  onNewConversation,
  onRename,
  onRenamed,
  onRetry,
  onSelect,
  selectedConversationId,
}: ConversationSidebarProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const newConversationRef = useRef<HTMLButtonElement>(null);
  const selectionRefs = useRef(new Map<string, HTMLButtonElement>());
  const hasItems = conversations.length > 0;

  useEffect(() => {
    const root = scrollRef.current;
    if (
      !root ||
      isLoading ||
      isLoadingMore ||
      incrementalError ||
      !hasMore ||
      root.scrollHeight > root.clientHeight
    ) {
      return;
    }
    onLoadMore();
  }, [conversations.length, hasMore, incrementalError, isLoading, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting) && !isLoadingMore && !incrementalError) {
          onLoadMore();
        }
      },
      { root: scrollRef.current }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, incrementalError, isLoadingMore, onLoadMore]);

  function finalFocusAfterDelete(index: number) {
    return () => {
      const next = conversations[index + 1] ?? conversations[index - 1];
      return next
        ? (selectionRefs.current.get(next.id) ?? newConversationRef.current)
        : newConversationRef.current;
    };
  }

  return (
    <nav
      ref={scrollRef}
      aria-label="Conversaciones"
      className="grid max-h-[calc(100vh-8rem)] content-start gap-3 overflow-y-auto"
    >
      <h2 className="text-sm font-semibold">Conversaciones</h2>
      <Button ref={newConversationRef} variant="outline" onClick={onNewConversation}>
        Nueva conversación
      </Button>
      {isLoading && !hasItems && (
        <p role="status" aria-label="Cargando conversaciones" className="text-sm text-muted-foreground">
          Cargando conversaciones…
        </p>
      )}
      {isError && !hasItems && (
        <Alert variant="destructive">
          <AlertDescription className="grid gap-2">
            No se pudieron cargar las conversaciones.
            <Button variant="outline" size="sm" onClick={onRetry}>
              Reintentar conversaciones
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!isLoading && !isError && !hasItems && (
        <p className="text-sm text-muted-foreground">No hay conversaciones guardadas.</p>
      )}
      {hasItems && (
        <>
          <p role="status" aria-label="Conversaciones cargadas" className="sr-only">
            Conversaciones cargadas
          </p>
          <div className="grid gap-1">
            {conversations.map((conversation, index) => (
              <div key={conversation.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
                <button
                  ref={node => {
                    if (node) selectionRefs.current.set(conversation.id, node);
                    else selectionRefs.current.delete(conversation.id);
                  }}
                  type="button"
                  aria-label={conversation.title}
                  aria-current={selectedConversationId === conversation.id ? 'page' : undefined}
                  className="min-w-0 rounded-xl px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect(conversation.id)}
                >
                  <span className="block truncate text-sm font-medium">{conversation.title}</span>
                  <time className="block text-xs text-muted-foreground" dateTime={conversation.updatedAt}>
                    {dateFormatter.format(new Date(conversation.updatedAt))}
                  </time>
                </button>
                <ConversationMenu
                  conversation={conversation}
                  deleteFinalFocus={finalFocusAfterDelete(index)}
                  onDelete={onDelete}
                  onDeleted={onDeleted}
                  onRename={onRename}
                  onRenamed={onRenamed}
                />
              </div>
            ))}
          </div>
          {incrementalError && (
            <Alert variant="destructive">
              <AlertDescription className="grid gap-2">
                No se pudieron cargar más conversaciones.
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Reintentar conversaciones
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {isLoadingMore && (
            <p role="status" aria-label="Cargando más conversaciones" className="text-sm text-muted-foreground">
              Cargando más conversaciones…
            </p>
          )}
        </>
      )}
      {hasMore && <div ref={sentinelRef} aria-label="Cargar más conversaciones" className="h-px" />}
    </nav>
  );
}
