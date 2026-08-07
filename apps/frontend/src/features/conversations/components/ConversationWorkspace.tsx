import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';

import { parseFrontendEnv } from '../../../config/env';
import {
  continueWithoutResponse,
  getTurnSnapshot,
  retryResponse,
} from '../api/conversationsApi';
import { createApiClient } from '../api/client';
import { useConversationExecution } from '../hooks/useConversationExecution';
import { useTurnEvents } from '../hooks/useTurnEvents';
import { conversationKeys } from '../queries/conversation-keys';
import type {
  ApiError,
  ConversationTurnResponse,
  ResponseSlot,
  Turn,
} from '../types/conversation';
import type { TurnEventSnapshot } from '../types/sse';
import { ConversationProcessingNotice } from './ConversationProcessingNotice';
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

function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as Pick<ApiError, 'message'>).message)
    : 'No se pudo completar la solicitud';
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
  onRetry,
  onContinueWithout,
}: {
  readonly snapshot: TurnEventSnapshot;
  readonly turns: readonly Turn[];
  readonly actionsDisabled: boolean;
  readonly onRetry: (turnId: string, slot: ResponseSlot) => void;
  readonly onContinueWithout: (turnId: string, slot: ResponseSlot) => void;
}) {
  const { runtimeStages, error } = useTurnEvents({
    conversationId: snapshot.conversationId,
    turnId: snapshot.turnId,
  });

  return (
    <div className="grid gap-4">
      <ConversationProcessingNotice isBusy={snapshot.hasWorkInProgress} sseError={error} />
      <TurnList
        turns={turns}
        activeTurnId={snapshot.turnId}
        hasWorkInProgress={snapshot.hasWorkInProgress || actionsDisabled}
        runtimeStages={runtimeStages}
        onRetry={onRetry}
        onContinueWithout={onContinueWithout}
      />
    </div>
  );
}

export function ConversationWorkspace() {
  const queryClient = useQueryClient();
  const [apiClient] = useState(() =>
    createApiClient({ baseURL: parseFrontendEnv(import.meta.env).apiBaseUrl })
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [streamGeneration, setStreamGeneration] = useState(0);

  const turnQuery = useQuery<TurnEventSnapshot>({
    queryKey: selection
      ? conversationKeys.turn(selection.conversationId, selection.turnId)
      : ['conversations', 'workspace', 'draft'],
    queryFn: async () => {
      if (!selection) throw new Error('No hay un turno seleccionado');

      const result = await getTurnSnapshot(apiClient, selection.conversationId, selection.turnId);
      const previous = queryClient.getQueryData<TurnEventSnapshot>(
        conversationKeys.turn(selection.conversationId, selection.turnId)
      );
      return {
        conversationId: selection.conversationId,
        turnId: selection.turnId,
        turn: result.turn,
        hasWorkInProgress: result.conversation.hasWorkInProgress,
        updatedAt: result.turn.updatedAt,
        lastEventSequence: previous?.lastEventSequence ?? 0,
      };
    },
    enabled: selection !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

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
    setTimeline(current => {
      if (current?.conversationId !== nextSelection.conversationId) {
        return { conversationId: nextSelection.conversationId, turnIds: [nextSelection.turnId] };
      }
      return current.turnIds.includes(nextSelection.turnId)
        ? current
        : { ...current, turnIds: [...current.turnIds, nextSelection.turnId] };
    });
    setSelection(nextSelection);
  }

  const execution = useConversationExecution({
    apiClient,
    conversationId: selection?.conversationId ?? null,
    onSuccess: cacheResult,
  });
  const retryMutation = useMutation({
    mutationFn: ({ turnId, slot }: { turnId: string; slot: ResponseSlot }) => {
      if (!selection) throw new Error('No hay un turno seleccionado');
      return retryResponse(apiClient, selection.conversationId, turnId, slot);
    },
    onSuccess: result => {
      cacheResult(result);
      setStreamGeneration(generation => generation + 1);
    },
  });
  const continueMutation = useMutation({
    mutationFn: ({ turnId, slot }: { turnId: string; slot: ResponseSlot }) => {
      if (!selection) throw new Error('No hay un turno seleccionado');
      return continueWithoutResponse(apiClient, selection.conversationId, turnId, slot);
    },
    onSuccess: cacheResult,
  });

  const mutationError = execution.error ?? retryMutation.error ?? continueMutation.error;
  const snapshot = turnQuery.data;
  const isBusy = snapshot?.hasWorkInProgress ?? false;
  const isPending =
    execution.isPending || retryMutation.isPending || continueMutation.isPending;
  const turns =
    timeline?.turnIds.flatMap(turnId => {
      const cached = queryClient.getQueryData<TurnEventSnapshot>(
        conversationKeys.turn(timeline.conversationId, turnId)
      );
      return cached ? [cached.turn] : [];
    }) ?? [];

  return (
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

      {snapshot && (
        <ActiveTimeline
          key={`${snapshot.conversationId}:${snapshot.turnId}:${streamGeneration}`}
          snapshot={snapshot}
          turns={turns}
          actionsDisabled={isPending}
          onRetry={(turnId, slot) => retryMutation.mutate({ turnId, slot })}
          onContinueWithout={(turnId, slot) => continueMutation.mutate({ turnId, slot })}
        />
      )}

      <PromptComposer
        key={selection?.turnId ?? 'draft'}
        isBusy={isBusy}
        isPending={isPending}
        onSubmit={execution.execute}
      />
    </section>
  );
}
