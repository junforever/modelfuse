import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConversationWorkspace } from '../ConversationWorkspace';
import type { ModelCatalogResponse } from '../../types/conversation';
import { renderWithQueryClient } from '../../../../test/query-test-utils';

const api = vi.hoisted(() => ({
  listAvailableDeployments: vi.fn(),
  listConversations: vi.fn(),
}));

vi.mock('../../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/conversationsApi')>()),
  listAvailableDeployments: api.listAvailableDeployments,
  listConversations: api.listConversations,
}));

const catalog: ModelCatalogResponse = {
  items: [
    ['base-1', 'openai', 'gpt-5', 'GPT-5'],
    ['base-2', 'google', 'gemini-3', 'Gemini 3'],
    ['base-3', 'minimax', 'minimax-m2', 'MiniMax M2'],
    ['consolidator', 'openai', 'gpt-5-mini', 'GPT-5 Mini'],
  ].map(([slot, providerId, modelId, displayName]) => ({
    deploymentId: `${slot}-deployment`,
    providerId: providerId as ModelCatalogResponse['items'][number]['providerId'],
    modelId,
    displayName,
    contextLimitTokens: 128_000,
    maxOutputTokens: 8_192,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
  })),
};

afterEach(() => vi.clearAllMocks());

describe('ConversationWorkspace', () => {
  it('shows provider-neutral comparison guidance with a non-Qwen consolidator', () => {
    api.listAvailableDeployments.mockResolvedValue(catalog);
    api.listConversations.mockResolvedValue({ items: [], nextCursor: null });

    renderWithQueryClient(<ConversationWorkspace />);

    expect(
      screen.getByText(
        'Envía una consulta para comparar tres respuestas y obtener una consolidación.'
      )
    ).toBeInTheDocument();
  });
});
