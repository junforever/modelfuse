import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';

import { parseFrontendEnv } from '../../../config/env';
import {
  continueWithoutResponse,
  createConversation,
  getTurnSnapshot,
  retryResponse,
} from '../api/conversationsApi';
import { createApiClient } from '../api/client';
import { useTurnEvents } from '../hooks/useTurnEvents';
import { conversationKeys } from '../queries/conversation-keys';
import type {
  ApiError,
  ConversationTurnResponse,
  CreateConversationRequest,
  ResponseSlot,
} from '../types/conversation';
import type { TurnEventSnapshot } from '../types/sse';
import { ConversationProcessingNotice } from './ConversationProcessingNotice';
import { PromptComposer } from './PromptComposer';
import { TurnCard } from './TurnCard';

interface Selection {
  readonly conversationId: string;
  readonly turnId: string;
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

function ActiveTurn({
  snapshot,
  actionsDisabled,
  onRetry,
  onContinueWithout,
}: {
  readonly snapshot: TurnEventSnapshot;
  readonly actionsDisabled: boolean;
  readonly onRetry: (slot: ResponseSlot) => void;
  readonly onContinueWithout: (slot: ResponseSlot) => void;
}) {
  const { runtimeStages, error } = useTurnEvents({
    conversationId: snapshot.conversationId,
    turnId: snapshot.turnId,
  });

  return (
    <div className="grid gap-4">
      <ConversationProcessingNotice isBusy={snapshot.hasWorkInProgress} sseError={error} />
      <TurnCard
        turn={snapshot.turn}
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
    setSelection(nextSelection);
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateConversationRequest) => createConversation(apiClient, payload),
    onSuccess: result => {
      cacheResult(result);
      setStreamGeneration(generation => generation + 1);
    },
  });
  const retryMutation = useMutation({
    mutationFn: (slot: ResponseSlot) => {
      if (!selection) throw new Error('No hay un turno seleccionado');
      return retryResponse(apiClient, selection.conversationId, selection.turnId, slot);
    },
    onSuccess: result => {
      cacheResult(result);
      setStreamGeneration(generation => generation + 1);
    },
  });
  const continueMutation = useMutation({
    mutationFn: (slot: ResponseSlot) => {
      if (!selection) throw new Error('No hay un turno seleccionado');
      return continueWithoutResponse(apiClient, selection.conversationId, selection.turnId, slot);
    },
    onSuccess: cacheResult,
  });

  const mutationError = createMutation.error ?? retryMutation.error ?? continueMutation.error;
  const snapshot = turnQuery.data;
  const isBusy = snapshot?.hasWorkInProgress ?? false;
  const isPending =
    createMutation.isPending || retryMutation.isPending || continueMutation.isPending;

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
        <ActiveTurn
          key={`${snapshot.conversationId}:${snapshot.turnId}:${streamGeneration}`}
          snapshot={snapshot}
          actionsDisabled={isPending}
          onRetry={slot => retryMutation.mutate(slot)}
          onContinueWithout={slot => continueMutation.mutate(slot)}
        />
      )}

      <PromptComposer
        key={selection?.conversationId ?? 'draft'}
        isBusy={isBusy}
        isPending={isPending}
        onSubmit={payload => createMutation.mutate(payload)}
      />
    </section>
  );
}
