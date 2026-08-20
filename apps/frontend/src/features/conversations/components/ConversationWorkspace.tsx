import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';

import { AppShell } from '../../../components/layout/AppShell';
import { parseFrontendEnv } from '../../../config/env';
import {
  continueWithoutResponse,
  getTurnSnapshot,
  retryResponse,
} from '../api/conversationsApi';
import { createApiClient } from '../api/client';
import { useConversationExecution } from '../hooks/useConversationExecution';
import { useConversationQueries } from '../hooks/useConversationQueries';
import { useTurnEvents } from '../hooks/useTurnEvents';
import { conversationKeys } from '../queries/conversation-keys';
import { apiErrorSchema } from '../schemas/conversationSchemas';
import type {
  ConversationPage,
  ConversationTurnResponse,
  DeploymentIds,
  ResponseSlot,
  Turn,
} from '../types/conversation';
import type { TurnEventSnapshot } from '../types/sse';
import { ConversationProcessingNotice } from './ConversationProcessingNotice';
import { ConversationSidebar } from './ConversationSidebar';
import { DeploymentSelectors } from './DeploymentSelectors';
import { HistoryTopSentinel } from './HistoryTopSentinel';
import { PromptComposer } from './PromptComposer';
import { TurnList } from './TurnList';

interface Selection {
  readonly conversationId: string;
  readonly turnId: string;
}

interface Timeline {
  readonly conversationId: string;
  readonly turnIds: readonly string[];
}

interface ConversationWorkspaceProps {
  readonly withHistory?: boolean;
}

const EMPTY_DEPLOYMENT_SELECTION: DeploymentIds = {
  'base-1': '',
  'base-2': '',
  'base-3': '',
  consolidator: '',
};

function errorMessage(error: unknown): string {
  const parsed = apiErrorSchema.safeParse(error);
  return parsed.success ? parsed.data.message : 'No se pudo completar la solicitud';
}

function toSnapshot(
  result: ConversationTurnResponse,
  lastEventSequence: number
): TurnEventSnapshot {
  return {
    conversationId: result.conversation.id,
    turnId: result.turn.id,
    turn: result.turn,
    hasWorkInProgress: result.conversation.hasWorkInProgress,
    updatedAt: result.conversation.updatedAt,
    lastEventSequence,
  };
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
}: {
  readonly snapshot: TurnEventSnapshot;
  readonly turns: readonly Turn[];
  readonly actionsDisabled: boolean;
  readonly collapseThreshold?: number;
  readonly historyRef: React.RefObject<HTMLDivElement | null>;
  readonly historyTopSentinel?: ReactNode;
  readonly onRetry: (turnId: string, slot: ResponseSlot) => void;
  readonly onContinueWithout: (turnId: string, slot: ResponseSlot) => void;
}) {
  const { runtimeStages, error } = useTurnEvents({
    conversationId: snapshot.conversationId,
    turnId: snapshot.turnId,
    enabled:
      snapshot.hasWorkInProgress ||
      (snapshot.turn.status !== 'partial' &&
        snapshot.turn.status !== 'completed' &&
        snapshot.turn.status !== 'failed'),
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

export function ConversationWorkspace({
  withHistory = false,
}: ConversationWorkspaceProps = {}) {
  const queryClient = useQueryClient();
  const historyRef = useRef<HTMLDivElement>(null);
  const [apiClient] = useState(() =>
    createApiClient({ baseURL: parseFrontendEnv(import.meta.env).apiBaseUrl })
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [deploymentSelection, setDeploymentSelection] = useState<DeploymentIds>(
    EMPTY_DEPLOYMENT_SELECTION
  );
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const environment = parseFrontendEnv(import.meta.env);
  const management = useConversationQueries(
    apiClient,
    selectedConversationId,
    withHistory
  );
  const latestHistoricalTurn = withHistory ? management.history.turns.at(-1) : undefined;
  const activeSelection =
    selection ??
    (selectedConversationId && latestHistoricalTurn
      ? { conversationId: selectedConversationId, turnId: latestHistoricalTurn.id }
      : null);

  useEffect(() => {
    const detail = management.detail.data;
    const historicalTurns = management.history.turns;
    if (!withHistory || !selectedConversationId || !detail || historicalTurns.length === 0) return;

    for (const turn of historicalTurns) {
      const key = conversationKeys.turn(selectedConversationId, turn.id);
      if (!queryClient.getQueryData(key)) {
        queryClient.setQueryData<TurnEventSnapshot>(key, {
          conversationId: selectedConversationId,
          turnId: turn.id,
          turn,
          hasWorkInProgress: detail.hasWorkInProgress,
          updatedAt: detail.updatedAt,
          lastEventSequence: 0,
        });
      }
    }

  }, [
    management.detail.data,
    management.history.turns,
    queryClient,
    selectedConversationId,
    withHistory,
  ]);

  const turnQuery = useQuery<TurnEventSnapshot>({
    queryKey: activeSelection
      ? conversationKeys.turn(activeSelection.conversationId, activeSelection.turnId)
      : ['conversations', 'workspace', 'draft'],
    queryFn: async () => {
      if (!activeSelection) throw new Error('No hay un turno seleccionado');

      const result = await getTurnSnapshot(
        apiClient,
        activeSelection.conversationId,
        activeSelection.turnId
      );
      const previous = queryClient.getQueryData<TurnEventSnapshot>(
        conversationKeys.turn(activeSelection.conversationId, activeSelection.turnId)
      );
      return {
        conversationId: activeSelection.conversationId,
        turnId: activeSelection.turnId,
        turn: result.turn,
        hasWorkInProgress: result.conversation.hasWorkInProgress,
        updatedAt: result.turn.updatedAt,
        lastEventSequence: previous?.lastEventSequence ?? 0,
      };
    },
    enabled: activeSelection !== null && (!withHistory || selection !== null),
    staleTime: Number.POSITIVE_INFINITY,
  });

  function updateSidebar(result: ConversationTurnResponse) {
    queryClient.setQueryData<InfiniteData<ConversationPage>>(
      conversationKeys.list(null),
      current => {
        if (!current) {
          return {
            pages: [{ items: [result.conversation], nextCursor: null }],
            pageParams: [null],
          };
        }

        return {
          ...current,
          pages: current.pages.map((page, index) => ({
            ...page,
            items:
              index === 0
                ? [
                    result.conversation,
                    ...page.items.filter(item => item.id !== result.conversation.id),
                  ]
                : page.items.filter(item => item.id !== result.conversation.id),
          })),
        };
      }
    );
  }

  function cacheResult(result: ConversationTurnResponse) {
    const nextSelection = {
      conversationId: result.conversation.id,
      turnId: result.turn.id,
    };
    const turnKey = conversationKeys.turn(nextSelection.conversationId, nextSelection.turnId);
    const previous = queryClient.getQueryData<TurnEventSnapshot>(turnKey);

    queryClient.setQueryData(
      conversationKeys.detail(nextSelection.conversationId),
      result.conversation
    );
    queryClient.setQueryData(turnKey, toSnapshot(result, previous?.lastEventSequence ?? 0));
    updateSidebar(result);
    setTimeline(current => {
      if (current?.conversationId !== nextSelection.conversationId) {
        return { conversationId: nextSelection.conversationId, turnIds: [nextSelection.turnId] };
      }
      return current.turnIds.includes(nextSelection.turnId)
        ? current
        : { ...current, turnIds: [...current.turnIds, nextSelection.turnId] };
    });
    setSelectedConversationId(nextSelection.conversationId);
    setSelection(nextSelection);
  }

  function startNewConversation() {
    setSelectedConversationId(null);
    setSelection(null);
    setTimeline(null);
    setDeploymentSelection(EMPTY_DEPLOYMENT_SELECTION);
    setDraftGeneration(generation => generation + 1);
  }

  const execution = useConversationExecution({
    apiClient,
    conversationId: activeSelection?.conversationId ?? null,
    onSuccess: cacheResult,
  });
  const retryMutation = useMutation({
    mutationFn: ({ turnId, slot }: { turnId: string; slot: ResponseSlot }) => {
      if (!activeSelection) throw new Error('No hay un turno seleccionado');
      return retryResponse(apiClient, activeSelection.conversationId, turnId, slot);
    },
    onSuccess: result => {
      cacheResult(result);
      setStreamGeneration(generation => generation + 1);
    },
  });
  const continueMutation = useMutation({
    mutationFn: ({ turnId, slot }: { turnId: string; slot: ResponseSlot }) => {
      if (!activeSelection) throw new Error('No hay un turno seleccionado');
      return continueWithoutResponse(apiClient, activeSelection.conversationId, turnId, slot);
    },
    onSuccess: cacheResult,
  });

  const mutationError = execution.error ?? retryMutation.error ?? continueMutation.error;
  const snapshot = turnQuery.data;
  const isBusy = snapshot?.hasWorkInProgress ?? management.detail.data?.hasWorkInProgress ?? false;
  const isPending = execution.isPending || retryMutation.isPending || continueMutation.isPending;
  const isNewConversation = selectedConversationId === null;
  const availableDeploymentIds = new Set(
    management.catalog.data?.items.map(item => item.deploymentId) ?? []
  );
  const deploymentIds =
    isNewConversation &&
    Object.values(deploymentSelection).every(deploymentId =>
      availableDeploymentIds.has(deploymentId)
    )
      ? deploymentSelection
      : undefined;
  const localTurns =
    timeline?.turnIds.flatMap(turnId => {
      const cached = queryClient.getQueryData<TurnEventSnapshot>(
        conversationKeys.turn(timeline.conversationId, turnId)
      );
      return cached ? [cached.turn] : [];
    }) ?? [];
  const historyTurnIds = new Set(management.history.turns.map(turn => turn.id));
  const turns = (withHistory && selectedConversationId
    ? [
        ...management.history.turns,
        ...localTurns.filter(turn => !historyTurnIds.has(turn.id)),
      ]
    : localTurns
  ).map(turn => {
    if (!selectedConversationId) return turn;
    return (
      queryClient.getQueryData<TurnEventSnapshot>(
        conversationKeys.turn(selectedConversationId, turn.id)
      )?.turn ?? turn
    );
  });
  const sidebarConversations = management.conversations.items.map(conversation =>
    conversation.id === management.detail.data?.id ? management.detail.data : conversation
  );
  const historyInitialError =
    selectedConversationId !== null &&
    (management.detail.isError || management.history.isError) &&
    management.history.turns.length === 0;
  const historyLoading =
    selectedConversationId !== null &&
    !historyInitialError &&
    (management.detail.isPending || management.history.isPending ||
      (management.history.turns.length > 0 && !snapshot));
  const historyEmpty =
    selectedConversationId !== null &&
    management.detail.isSuccess &&
    management.history.isSuccess &&
    management.history.turns.length === 0;
  const historyTopSentinel = withHistory && selectedConversationId ? (
    <HistoryTopSentinel
      containerRef={historyRef}
      hasOlder={management.history.hasNextPage}
      isError={management.history.isFetchNextPageError}
      isLoading={management.history.isFetchingNextPage}
      onLoadOlder={management.history.loadOlder}
      pageCount={management.history.pageCount}
    />
  ) : undefined;

  const workspace = (
    <section aria-labelledby="workspace-title" className="mx-auto grid w-full max-w-5xl gap-6">
      <header className="grid gap-1">
        <h1 id="workspace-title" className="text-2xl font-semibold tracking-tight">
          Comparar respuestas
        </h1>
        <p className="text-sm text-muted-foreground">
          Envía una consulta para comparar tres modelos y la consolidación de Qwen.
        </p>
      </header>

      {mutationError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>No se pudo completar la acción</AlertTitle>
          <AlertDescription>{errorMessage(mutationError)}</AlertDescription>
        </Alert>
      )}

      {turnQuery.isError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>No se pudo cargar el turno</AlertTitle>
          <AlertDescription>{errorMessage(turnQuery.error)}</AlertDescription>
        </Alert>
      )}

      {withHistory && historyLoading && (
        <p role="status" aria-label="Cargando historial" className="text-sm text-muted-foreground">
          Cargando historial…
        </p>
      )}
      {withHistory && historyInitialError && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar el historial</AlertTitle>
          <AlertDescription className="grid gap-2">
            Inténtalo de nuevo.
            <button
              type="button"
              className="w-fit underline underline-offset-4"
              onClick={() => {
                void management.detail.refetch();
                void management.history.refetch();
              }}
            >
              Reintentar historial
            </button>
          </AlertDescription>
        </Alert>
      )}
      {withHistory && historyEmpty && (
        <p className="text-sm text-muted-foreground">No hay turnos en esta conversación.</p>
      )}

      {snapshot && (
        <ActiveTimeline
          key={`${snapshot.conversationId}:${snapshot.turnId}:${streamGeneration}`}
          snapshot={snapshot}
          turns={turns}
          actionsDisabled={isPending}
          collapseThreshold={withHistory ? environment.historyCollapseCharThreshold : undefined}
          historyRef={historyRef}
          historyTopSentinel={historyTopSentinel}
          onRetry={(turnId, slot) => retryMutation.mutate({ turnId, slot })}
          onContinueWithout={(turnId, slot) => continueMutation.mutate({ turnId, slot })}
        />
      )}

      {isNewConversation && (
        <DeploymentSelectors
          items={management.catalog.data?.items ?? []}
          selection={deploymentSelection}
          isLoading={management.catalog.isPending}
          disabled={isPending}
          onChange={setDeploymentSelection}
        />
      )}

      <PromptComposer
        key={activeSelection?.turnId ?? `draft:${draftGeneration}`}
        isBusy={isBusy}
        isDisabled={isNewConversation && !deploymentIds}
        isPending={isPending}
        deploymentIds={deploymentIds}
        onSubmit={execution.execute}
      />
    </section>
  );

  if (!withHistory) return workspace;

  return (
    <AppShell
      sidebar={
        <ConversationSidebar
          conversations={sidebarConversations}
          selectedConversationId={selectedConversationId}
          isLoading={management.conversations.isPending}
          isError={management.conversations.isError}
          hasMore={management.conversations.hasNextPage}
          isLoadingMore={management.conversations.isFetchingNextPage}
          incrementalError={management.conversations.isFetchNextPageError}
          onLoadMore={management.conversations.loadMore}
          onNewConversation={startNewConversation}
          onRetry={() => {
            if (management.conversations.isFetchNextPageError) {
              void management.conversations.loadMore();
            } else {
              void management.conversations.refetch();
            }
          }}
          onSelect={conversationId => {
            setSelectedConversationId(conversationId);
            setSelection(null);
            setTimeline(null);
          }}
          onRename={(id, title) => management.rename.mutateAsync({ id, title })}
          onDelete={id => management.remove.mutateAsync(id)}
          onDeleted={id => {
            if (id !== selectedConversationId) return;
            startNewConversation();
          }}
        />
      }
    >
      {workspace}
    </AppShell>
  );
}
