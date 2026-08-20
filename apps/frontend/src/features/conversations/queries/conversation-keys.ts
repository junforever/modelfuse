export const conversationKeys = {
  all: ['conversations'] as const,
  catalog: ['model-catalog'] as const,
  lists: ['conversations', 'list'] as const,
  list: (cursor?: string | null) => ['conversations', 'list', { cursor }] as const,
  detail: (conversationId: string) => ['conversations', 'detail', conversationId] as const,
  turns: (conversationId: string, before?: string | null) =>
    ['conversations', 'detail', conversationId, 'turns', { before }] as const,
  turn: (conversationId: string, turnId: string) =>
    ['conversations', 'detail', conversationId, 'turns', turnId] as const,
};
