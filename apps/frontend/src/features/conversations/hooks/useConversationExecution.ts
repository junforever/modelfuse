import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';

import { createConversation, createTurn } from '../api/conversationsApi';
import type {
  ConversationTurnResponse,
  CreateConversationRequest,
} from '../types/conversation';

interface UseConversationExecutionOptions {
  readonly apiClient: AxiosInstance;
  readonly conversationId: string | null;
  readonly onSuccess: (result: ConversationTurnResponse) => void;
}

export function useConversationExecution({
  apiClient,
  conversationId,
  onSuccess,
}: UseConversationExecutionOptions) {
  const activeRequestId = useRef<string | null>(null);
  const mutation = useMutation({
    mutationFn: ({ deploymentIds, ...payload }: CreateConversationRequest) =>
      conversationId
        ? createTurn(apiClient, conversationId, payload)
        : createConversation(apiClient, { ...payload, ...(deploymentIds ? { deploymentIds } : {}) }),
    onSuccess,
  });

  function execute(payload: CreateConversationRequest) {
    if (activeRequestId.current) return;

    activeRequestId.current = payload.clientRequestId;
    mutation.mutate(payload, {
      onSettled: () => {
        activeRequestId.current = null;
      },
    });
  }

  return {
    error: mutation.error,
    execute,
    isPending: mutation.isPending,
  };
}
