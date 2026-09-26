import { type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { AppShell } from '../../../components/layout/AppShell';
import { ConversationDeploymentSummary } from './ConversationDeploymentSummary';
import { ConversationProcessingNotice } from './ConversationProcessingNotice';
import { ConversationSidebar } from './ConversationSidebar';
import { DeploymentSelectors } from './DeploymentSelectors';
import { PromptComposer } from './PromptComposer';
import { TurnList } from './TurnList';
import { useConversationWorkspace, errorMessage } from '../hooks/useConversationWorkspace';
import { useTurnEvents } from '../hooks/useTurnEvents';
import type { ResponseSlot, Turn } from '../types/conversation';
import type { TurnEventSnapshot } from '../types/sse';

interface ConversationWorkspaceProps {
  readonly withHistory?: boolean;
}

interface ActiveTimelineProps {
  readonly snapshot: TurnEventSnapshot;
  readonly turns: readonly Turn[];
  readonly actionsDisabled: boolean;
  readonly collapseThreshold?: number;
  readonly historyRef: React.RefObject<HTMLDivElement | null>;
  readonly historyTopSentinel?: ReactNode;
  readonly onRetry: (turnId: string, slot: ResponseSlot) => void;
  readonly onContinueWithout: (turnId: string, slot: ResponseSlot) => void;
}

function ActiveTimeline({
  snapshot,
  turns,
  actionsDisabled,
  collapseThreshold,
  historyRef,
  historyTopSentinel,
  onRetry,
  onContinueWithout,
}: ActiveTimelineProps) {
  const { runtimeStages, error } = useTurnEvents({
    conversationId: snapshot.conversationId,
    turnId: snapshot.turnId,
    enabled:
      snapshot.hasWorkInProgress ||
      !['partial', 'completed', 'failed'].includes(snapshot.turn.status),
  });

  return (
    <div className="grid gap-4">
      <ConversationProcessingNotice isBusy={snapshot.hasWorkInProgress} sseError={error} />
      <div
        ref={historyRef}
        role="region"
        aria-label="Historial de conversación"
        className="max-h-[65vh] overflow-y-auto"
      >
        <TurnList
          deployments={snapshot.deployments}
          turns={turns}
          activeTurnId={snapshot.turnId}
          hasWorkInProgress={snapshot.hasWorkInProgress || actionsDisabled}
          runtimeStages={runtimeStages}
          collapseThreshold={collapseThreshold}
          historyTopSentinel={historyTopSentinel}
          onRetry={onRetry}
          onContinueWithout={onContinueWithout}
        />
      </div>
    </div>
  );
}

export function ConversationWorkspace({ withHistory = false }: ConversationWorkspaceProps = {}) {
  const workspace = useConversationWorkspace(withHistory);
  const content = (
    <section aria-labelledby="workspace-title" className="mx-auto grid w-full max-w-5xl gap-6">
      <header className="grid gap-1">
        <h1 id="workspace-title" className="text-2xl font-semibold tracking-tight">
          Comparar respuestas
        </h1>
        <p className="text-sm text-muted-foreground">
          Envía una consulta para comparar tres respuestas y obtener una consolidación.
        </p>
      </header>

      {(workspace.mutationError || workspace.failedTurnMessage) && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>No se pudo completar la acción</AlertTitle>
          <AlertDescription>
            {workspace.failedTurnMessage ?? 'No se pudo completar la solicitud'}
          </AlertDescription>
        </Alert>
      )}
      {workspace.turnIsError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>No se pudo cargar el turno</AlertTitle>
          <AlertDescription>{errorMessage(workspace.turnError)}</AlertDescription>
        </Alert>
      )}
      {withHistory && workspace.historyLoading && (
        <p role="status" aria-label="Cargando historial" className="text-sm text-muted-foreground">
          Cargando historial…
        </p>
      )}
      {withHistory && workspace.historyInitialError && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar el historial</AlertTitle>
          <AlertDescription className="grid gap-2">
            Inténtalo de nuevo.
            <button
              type="button"
              className="w-fit underline underline-offset-4"
              onClick={() => {
                void workspace.management.detail.refetch();
                void workspace.management.history.refetch();
              }}
            >
              Reintentar historial
            </button>
          </AlertDescription>
        </Alert>
      )}
      {withHistory && workspace.historyEmpty && (
        <p className="text-sm text-muted-foreground">No hay turnos en esta conversación.</p>
      )}
      {workspace.selectedConversationId && workspace.storedDeployments && (
        <ConversationDeploymentSummary
          deployments={workspace.storedDeployments}
          webSearchEnabled={workspace.webSearchEnabled}
        />
      )}
      {workspace.snapshot && (
        <ActiveTimeline
          key={`${workspace.snapshot.conversationId}:${workspace.snapshot.turnId}:${workspace.streamGeneration}`}
          snapshot={workspace.snapshot}
          turns={workspace.turns}
          actionsDisabled={workspace.isPending}
          collapseThreshold={
            withHistory ? workspace.environment.historyCollapseCharThreshold : undefined
          }
          historyRef={workspace.historyRef}
          historyTopSentinel={workspace.historyTopSentinel}
          onRetry={workspace.retry}
          onContinueWithout={workspace.continueWithout}
        />
      )}
      {workspace.isNewConversation && (
        <DeploymentSelectors
          items={workspace.management.catalog.data?.items ?? []}
          selection={workspace.deploymentSelection}
          isLoading={workspace.management.catalog.isPending}
          isError={workspace.management.catalog.isError}
          disabled={workspace.isPending}
          webSearchEnabled={workspace.webSearchEnabled}
          onChange={workspace.setDraftDeploymentSelection}
        />
      )}
      <PromptComposer
        key={`composer:${workspace.draftGeneration}`}
        isBusy={workspace.isBusy}
        isDisabled={workspace.isNewConversation && !workspace.deploymentIds}
        isPending={workspace.isPending}
        canUseWebSearch={workspace.canUseWebSearch}
        webSearchEnabled={workspace.webSearchEnabled}
        deploymentIds={workspace.deploymentIds}
        onWebSearchEnabledChange={workspace.setWebSearchEnabled}
        onSubmit={workspace.execute}
      />
    </section>
  );

  if (!withHistory) return content;

  return (
    <AppShell
      sidebar={
        <ConversationSidebar
          conversations={workspace.sidebarConversations}
          selectedConversationId={workspace.selectedConversationId}
          isLoading={workspace.management.conversations.isPending}
          isError={workspace.management.conversations.isError}
          hasMore={workspace.management.conversations.hasNextPage}
          isLoadingMore={workspace.management.conversations.isFetchingNextPage}
          incrementalError={workspace.management.conversations.isFetchNextPageError}
          onLoadMore={workspace.management.conversations.loadMore}
          onNewConversation={workspace.startNewConversation}
          onRetry={() =>
            workspace.management.conversations.isFetchNextPageError
              ? void workspace.management.conversations.loadMore()
              : void workspace.management.conversations.refetch()
          }
          onSelect={workspace.selectConversation}
          onRename={(id, title) => workspace.management.rename.mutateAsync({ id, title })}
          onDelete={id => workspace.management.remove.mutateAsync(id)}
          onDeleted={id => {
            if (id === workspace.selectedConversationId) {
              workspace.startNewConversation();
            }
          }}
        />
      }
    >
      {content}
    </AppShell>
  );
}
