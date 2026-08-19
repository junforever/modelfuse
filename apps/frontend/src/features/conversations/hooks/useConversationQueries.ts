import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { useMemo } from 'react';

import {
  deleteConversation,
  getConversation,
  listConversations,
  listConversationTurns,
  renameConversation,
} from '../api/conversationsApi';
import { conversationKeys } from '../queries/conversation-keys';
import type {
  ConversationPage,
  ConversationSummary,
  Turn,
  TurnPage,
} from '../types/conversation';

function uniqueConversations(pages: readonly ConversationPage[]): readonly ConversationSummary[] {
  return [...new Map(pages.flatMap(page => page.items).map(item => [item.id, item])).values()];
}

function chronologicalTurns(pages: readonly TurnPage[]): readonly Turn[] {
  return [
    ...new Map(
      [...pages]
        .reverse()
        .flatMap(page => page.items)
        .map(turn => [turn.id, turn])
    ).values(),
  ];
}

function updateConversationPages(
  data: InfiniteData<ConversationPage> | undefined,
  conversation: ConversationSummary
): InfiniteData<ConversationPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      items: page.items.map(item => (item.id === conversation.id ? conversation : item)),
    })),
  };
}

function removeFromConversationPages(
  data: InfiniteData<ConversationPage> | undefined,
  conversationId: string
): InfiniteData<ConversationPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      items: page.items.filter(item => item.id !== conversationId),
    })),
  };
}

export function useConversationQueries(
  client: AxiosInstance,
  conversationId: string | null,
  enabled = true
) {
  const queryClient = useQueryClient();
  const conversations = useInfiniteQuery({
    queryKey: conversationKeys.list(null),
    queryFn: ({ pageParam, signal }) => listConversations(client, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled,
  });
  const detail = useQuery({
    queryKey: conversationId
      ? conversationKeys.detail(conversationId)
      : [...conversationKeys.all, 'detail', 'none'],
    queryFn: ({ signal }) => {
      if (!conversationId) throw new Error('No hay una conversación seleccionada');
      return getConversation(client, conversationId, signal);
    },
    enabled: enabled && conversationId !== null,
  });
  const history = useInfiniteQuery({
    queryKey: conversationId
      ? conversationKeys.turns(conversationId, null)
      : [...conversationKeys.all, 'detail', 'none', 'turns'],
    queryFn: ({ pageParam, signal }) => {
      if (!conversationId) throw new Error('No hay una conversación seleccionada');
      return listConversationTurns(client, conversationId, pageParam, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: page => page.olderCursor,
    enabled: enabled && conversationId !== null,
  });
  const rename = useMutation({
    mutationFn: ({ id, title }: { readonly id: string; readonly title: string }) =>
      renameConversation(client, id, { title }),
    onSuccess: conversation => {
      queryClient.setQueryData(conversationKeys.detail(conversation.id), conversation);
      queryClient.setQueriesData<InfiniteData<ConversationPage>>(
        { queryKey: conversationKeys.lists },
        data => updateConversationPages(data, conversation)
      );
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteConversation(client, id),
    onSuccess: (_result, id) => {
      queryClient.setQueriesData<InfiniteData<ConversationPage>>(
        { queryKey: conversationKeys.lists },
        data => removeFromConversationPages(data, id)
      );
      queryClient.removeQueries({ queryKey: conversationKeys.detail(id) });
    },
  });

  const conversationItems = useMemo(
    () => uniqueConversations(conversations.data?.pages ?? []),
    [conversations.data]
  );
  const historyTurns = useMemo(
    () => chronologicalTurns(history.data?.pages ?? []),
    [history.data]
  );

  return {
    conversations: {
      ...conversations,
      items: conversationItems,
      loadMore: () => conversations.fetchNextPage({ cancelRefetch: false }),
    },
    detail,
    history: {
      ...history,
      turns: historyTurns,
      pageCount: history.data?.pages.length ?? 0,
      loadOlder: () => history.fetchNextPage({ cancelRefetch: false }),
    },
    rename,
    remove,
  };
}
