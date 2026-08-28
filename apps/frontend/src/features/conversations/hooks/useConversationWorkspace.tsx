import { useEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { continueWithoutResponse, getTurnSnapshot, retryResponse } from '../api/conversationsApi';
import { createApiClient } from '../api/client';
import { parseFrontendEnv } from '../../../config/env';
import { useConversationExecution } from './useConversationExecution';
import { useConversationQueries } from './useConversationQueries';
import { conversationKeys } from '../queries/conversation-keys';
import { apiErrorSchema } from '../schemas/conversationSchemas';
import { responseFailureMessage } from '../utils/responseFailure';
import type {
  ConversationPage,
  ConversationTurnResponse,
  DeploymentIds,
  ResponseSlot,
} from '../types/conversation';
import type { TurnEventSnapshot } from '../types/sse';
import { HistoryTopSentinel } from '../components/HistoryTopSentinel';
import {
  getDefaultDeploymentSelection,
  getDuplicateDeploymentIds,
} from '../components/deploymentSelectorUtils';

interface Selection {
  readonly conversationId: string;
  readonly turnId: string;
}

interface Timeline {
  readonly conversationId: string;
  readonly turnIds: readonly string[];
}

function toSnapshot(
  result: ConversationTurnResponse,
  lastEventSequence: number
): TurnEventSnapshot {
  return {
    conversationId: result.conversation.id,
    turnId: result.turn.id,
    deployments: result.conversation.deployments,
    turn: result.turn,
    hasWorkInProgress: result.conversation.hasWorkInProgress,
    updatedAt: result.conversation.updatedAt,
    lastEventSequence,
  };
}

export function errorMessage(error: unknown): string {
  const parsed = apiErrorSchema.safeParse(error);
  return parsed.success ? parsed.data.message : 'No se pudo completar la solicitud';
}

function currentTurnFailureMessage(snapshot: TurnEventSnapshot | undefined): string | null {
  const failedResponse = snapshot?.turn.responses.find(
    response => response.status === 'failed' && !response.continuedWithout
  );
  return failedResponse ? responseFailureMessage(failedResponse) : null;
}

export function useConversationWorkspace(withHistory: boolean) {
  const queryClient = useQueryClient();
  const historyRef = useRef<HTMLDivElement>(null);
  const [apiClient] = useState(() =>
    createApiClient({ baseURL: parseFrontendEnv(import.meta.env).apiBaseUrl })
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [draftDeploymentSelection, setDraftDeploymentSelection] = useState<DeploymentIds | null>(
    null
  );
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const environment = parseFrontendEnv(import.meta.env);
  const management = useConversationQueries(apiClient, selectedConversationId, withHistory);
  const latestHistoricalTurn = withHistory ? management.history.turns.at(-1) : undefined;
  const activeSelection =
    selection ??
    (selectedConversationId && latestHistoricalTurn
      ? { conversationId: selectedConversationId, turnId: latestHistoricalTurn.id }
      : null);

  useEffect(() => {
    const detail = management.detail.data;
    const historicalTurns = management.history.turns;
    if (!withHistory || !selectedConversationId || !detail || historicalTurns.length === 0) {
      return;
    }
    for (const turn of historicalTurns) {
      const key = conversationKeys.turn(selectedConversationId, turn.id);
      if (!queryClient.getQueryData(key)) {
        queryClient.setQueryData<TurnEventSnapshot>(key, {
          conversationId: selectedConversationId,
          turnId: turn.id,
          deployments: detail.deployments,
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
      const deployments = previous?.deployments ?? management.detail.data?.deployments;
      if (!deployments) throw new Error('No se pudo conservar la asignación de la conversación');
      return {
        conversationId: activeSelection.conversationId,
        turnId: activeSelection.turnId,
        deployments,
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
    setTimeline(current =>
      current?.conversationId !== nextSelection.conversationId
        ? {
            conversationId: nextSelection.conversationId,
            turnIds: [nextSelection.turnId],
          }
        : current.turnIds.includes(nextSelection.turnId)
          ? current
          : { ...current, turnIds: [...current.turnIds, nextSelection.turnId] }
    );
    setSelectedConversationId(nextSelection.conversationId);
    setSelection(nextSelection);
  }

  function startNewConversation() {
    setSelectedConversationId(null);
    setSelection(null);
    setTimeline(null);
    setDraftDeploymentSelection(null);
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

  const snapshot = turnQuery.data;
  const failedTurnMessage = currentTurnFailureMessage(snapshot);
  const storedDeployments =
    snapshot?.deployments ??
    (management.detail.data?.id === selectedConversationId
      ? management.detail.data.deployments
      : undefined);
  const isBusy = snapshot?.hasWorkInProgress ?? management.detail.data?.hasWorkInProgress ?? false;
  const isPending = execution.isPending || retryMutation.isPending || continueMutation.isPending;
  const isNewConversation = selectedConversationId === null;
  const deploymentSelection =
    draftDeploymentSelection ?? getDefaultDeploymentSelection(management.catalog.data?.items ?? []);
  const availableDeploymentIds = new Set(
    management.catalog.data?.items.map(item => item.deploymentId) ?? []
  );
  const hasDuplicateDeploymentIds = getDuplicateDeploymentIds(deploymentSelection).size > 0;
  const deploymentIds =
    isNewConversation &&
    management.catalog.isSuccess &&
    !hasDuplicateDeploymentIds &&
    Object.values(deploymentSelection).every(id => availableDeploymentIds.has(id))
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
  const turns = (
    withHistory && selectedConversationId
      ? [...management.history.turns, ...localTurns.filter(turn => !historyTurnIds.has(turn.id))]
      : localTurns
  ).map(turn =>
    selectedConversationId
      ? (queryClient.getQueryData<TurnEventSnapshot>(
          conversationKeys.turn(selectedConversationId, turn.id)
        )?.turn ?? turn)
      : turn
  );
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
    (management.detail.isPending ||
      management.history.isPending ||
      (management.history.turns.length > 0 && !snapshot));
  const historyEmpty =
    selectedConversationId !== null &&
    management.detail.isSuccess &&
    management.history.isSuccess &&
    management.history.turns.length === 0;
  const historyTopSentinel: ReactNode =
    withHistory && selectedConversationId ? (
      <HistoryTopSentinel
        containerRef={historyRef}
        hasOlder={management.history.hasNextPage}
        isError={management.history.isFetchNextPageError}
        isLoading={management.history.isFetchingNextPage}
        onLoadOlder={management.history.loadOlder}
        pageCount={management.history.pageCount}
      />
    ) : undefined;

  return {
    historyRef: historyRef as RefObject<HTMLDivElement | null>,
    environment,
    management,
    selectedConversationId,
    snapshot,
    storedDeployments,
    isBusy,
    isPending,
    isNewConversation,
    deploymentSelection,
    deploymentIds,
    turns,
    sidebarConversations,
    historyInitialError,
    historyLoading,
    historyEmpty,
    historyTopSentinel,
    mutationError: execution.error ?? retryMutation.error ?? continueMutation.error,
    failedTurnMessage,
    turnError: turnQuery.error,
    turnIsError: turnQuery.isError,
    streamGeneration,
    draftGeneration,
    activeSelection,
    setDraftDeploymentSelection,
    execute: execution.execute,
    retry: (turnId: string, slot: ResponseSlot) => retryMutation.mutate({ turnId, slot }),
    continueWithout: (turnId: string, slot: ResponseSlot) =>
      continueMutation.mutate({ turnId, slot }),
    startNewConversation,
    selectConversation: (conversationId: string) => {
      setSelectedConversationId(conversationId);
      setSelection(null);
      setTimeline(null);
    },
  };
}
