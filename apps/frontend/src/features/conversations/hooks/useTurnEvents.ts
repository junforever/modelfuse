import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { parseFrontendEnv } from '../../../config/env';
import { turnEventSchema } from '../schemas/conversationSchemas';
import type { ConversationDetail, ResponseSlot } from '../types/conversation';
import type { TurnEventSnapshot } from '../types/sse';
import { applyConversationEvent } from '../queries/conversation-cache';
import { conversationKeys } from '../queries/conversation-keys';

export type RuntimeStages = Partial<Record<ResponseSlot, string>>;

interface UseTurnEventsOptions {
  readonly conversationId: string;
  readonly turnId: string;
  readonly enabled?: boolean;
}

interface UseTurnEventsResult {
  readonly runtimeStages: RuntimeStages;
  readonly error: string | null;
}

const terminalTurnStatuses = new Set(['partial', 'completed', 'failed']);
const streamErrorMessage = 'No se pudo actualizar en tiempo real';

export function useTurnEvents({
  conversationId,
  turnId,
  enabled = true,
}: UseTurnEventsOptions): UseTurnEventsResult {
  const queryClient = useQueryClient();
  const [runtimeStages, setRuntimeStages] = useState<RuntimeStages>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const abortController = new AbortController();
    const { apiBaseUrl } = parseFrontendEnv(import.meta.env);
    const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;
    const streamUrl = new URL(
      `conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/events`,
      baseUrl
    );
    const source = new EventSource(streamUrl);
    const turnKey = conversationKeys.turn(conversationId, turnId);
    let converged = false;

    const convergeIfTerminal = (snapshot: TurnEventSnapshot) => {
      if (
        converged ||
        snapshot.hasWorkInProgress ||
        !terminalTurnStatuses.has(snapshot.turn.status)
      ) {
        return;
      }

      converged = true;
      source.close();
      setRuntimeStages({});
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
      void queryClient.invalidateQueries({ queryKey: turnKey });
    };

    const handleEvent =
      (eventName: 'slot_update' | 'turn_update' | 'busy_update') => (message: Event) => {
        if (abortController.signal.aborted) return;

        try {
          const parsed = turnEventSchema.safeParse({
            event: eventName,
            data: JSON.parse((message as MessageEvent<string>).data) as unknown,
          });

          if (!parsed.success) {
            setError(streamErrorMessage);
            return;
          }

          const turnEvent = parsed.data;
          let applied = false;
          const snapshot = queryClient.setQueryData<TurnEventSnapshot>(turnKey, current => {
            if (!current) return undefined;
            const next = applyConversationEvent(current, turnEvent);
            applied = next !== current;
            return next;
          });

          if (!snapshot) return;
          convergeIfTerminal(snapshot);
          if (!applied) return;
          setError(null);

          if (turnEvent.event === 'slot_update') {
            const { response, runtimeStage } = turnEvent.data;
            setRuntimeStages(current => {
              if (response.status !== 'running') {
                const remaining = { ...current };
                delete remaining[response.slot];
                return remaining;
              }
              return runtimeStage === undefined
                ? current
                : { ...current, [response.slot]: runtimeStage };
            });
          } else if (turnEvent.event === 'busy_update') {
            const busyUpdate = turnEvent.data;
            queryClient.setQueryData<ConversationDetail>(
              conversationKeys.detail(conversationId),
              current =>
                current
                  ? {
                      ...current,
                      deployments: snapshot.deployments,
                      hasWorkInProgress: busyUpdate.hasWorkInProgress,
                      updatedAt: busyUpdate.updatedAt,
                    }
                  : undefined
            );
          }
        } catch {
          setError(streamErrorMessage);
        }
      };

    const slotListener = handleEvent('slot_update');
    const turnListener = handleEvent('turn_update');
    const busyListener = handleEvent('busy_update');

    source.addEventListener('slot_update', slotListener);
    source.addEventListener('turn_update', turnListener);
    source.addEventListener('busy_update', busyListener);
    source.onerror = () => {
      if (!abortController.signal.aborted) setError(streamErrorMessage);
    };

    return () => {
      abortController.abort();
      source.removeEventListener('slot_update', slotListener);
      source.removeEventListener('turn_update', turnListener);
      source.removeEventListener('busy_update', busyListener);
      source.onerror = null;
      source.close();
      setRuntimeStages({});
    };
  }, [conversationId, enabled, queryClient, turnId]);

  return { runtimeStages, error };
}
