import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationWorkspace } from '../ConversationWorkspace';
import { useConversationExecution } from '../../hooks/useConversationExecution';
import {
  conversationId,
  deploymentSummaries,
  eventTime,
  modelResponse,
  turnFixture,
} from '../../../../test/conversation-fixtures';
import { renderWithQueryClient } from '../../../../test/query-test-utils';
import type {
  ConversationDetail,
  ConversationTurnResponse,
  CreateConversationRequest,
  ModelCatalogResponse,
  TurnResponses,
} from '../../types/conversation';

const api = vi.hoisted(() => ({
  getConversation: vi.fn(),
  listAvailableDeployments: vi.fn(),
  listConversationTurns: vi.fn(),
  listConversations: vi.fn(),
}));

vi.mock('../../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/conversationsApi')>()),
  getConversation: api.getConversation,
  listAvailableDeployments: api.listAvailableDeployments,
  listConversationTurns: api.listConversationTurns,
  listConversations: api.listConversations,
}));

vi.mock('../../hooks/useConversationExecution', () => ({
  useConversationExecution: vi.fn(),
}));

const catalog: ModelCatalogResponse = {
  items: [
    ['openai-5.6-sol', 'openai', 'gpt-5.6-sol', 'GPT-5.6 Sol'],
    ['gemini-3.7-flash', 'google', 'gemini-3.7-flash', 'Gemini 3.7 Flash'],
    ['openrouter-minimax-m3', 'openrouter', 'minimax-m3', 'MiniMax M3'],
    ['openrouter-qwen-3.8-max', 'openrouter', 'qwen-3.8-max', 'Qwen 3.8 Max'],
  ].map(([deploymentId, providerId, modelId, displayName]) => ({
    deploymentId,
    providerId: providerId as ModelCatalogResponse['items'][number]['providerId'],
    modelId,
    displayName,
    contextLimitTokens: 128_000,
    maxOutputTokens: 8_192,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
  })),
};

function conversationDetail(): ConversationDetail {
  return {
    id: conversationId,
    title: 'Nueva conversación',
    hasWorkInProgress: false,
    createdAt: eventTime,
    updatedAt: eventTime,
    deployments: deploymentSummaries,
  };
}

function failedTurnResult(continuedWithout: boolean): ConversationTurnResponse {
  const responses: TurnResponses = [
    modelResponse('base-1'),
    modelResponse('base-2', {
      status: 'failed',
      error: { code: 'timeout', message: 'El deployment tardó demasiado.' },
      continuedWithout,
    }),
    modelResponse('base-3'),
    modelResponse('consolidator'),
  ];

  return {
    conversation: conversationDetail(),
    turn: turnFixture({ status: 'failed', responses }),
  };
}

function mockExecution(result: ConversationTurnResponse | null, error: Error | null = null) {
  vi.mocked(useConversationExecution).mockImplementation(({ onSuccess }) => ({
    error,
    execute: (_payload: CreateConversationRequest) => {
      if (result) onSuccess(result);
    },
    isPending: false,
  }));
}

async function submitResult(result: ConversationTurnResponse) {
  mockExecution(result);
  const user = userEvent.setup();
  renderWithQueryClient(<ConversationWorkspace withHistory />);

  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: 'Base 1' })).toHaveTextContent('openai-5.6-sol');
    expect(screen.getByRole('combobox', { name: 'Base 2' })).toHaveTextContent('gemini-3.7-flash');
    expect(screen.getByRole('combobox', { name: 'Base 3' })).toHaveTextContent(
      'openrouter-minimax-m3'
    );
    expect(screen.getByRole('combobox', { name: 'Consolidador' })).toHaveTextContent(
      'openrouter-qwen-3.8-max'
    );
  });
  await user.type(screen.getByLabelText('Prompt'), 'Compara estas respuestas');
  const submit = screen.getByRole('button', { name: 'Enviar' });
  await waitFor(() => expect(submit).toBeEnabled());
  await user.click(submit);
}

beforeEach(() => {
  api.getConversation.mockResolvedValue(conversationDetail());
  api.listAvailableDeployments.mockResolvedValue(catalog);
  api.listConversationTurns.mockResolvedValue({ items: [], olderCursor: null, hasOlder: false });
  api.listConversations.mockResolvedValue({ items: [], nextCursor: null });
  mockExecution(null);
});

afterEach(() => vi.clearAllMocks());

describe('ConversationWorkspace', () => {
  it('shows provider-neutral comparison guidance with a non-Qwen consolidator', () => {
    renderWithQueryClient(<ConversationWorkspace />);

    expect(
      screen.getByText(
        'Envía una consulta para comparar tres respuestas y obtener una consolidación.'
      )
    ).toBeInTheDocument();
  });

  it('derives a safe Base 2 alert from the current failed snapshot', async () => {
    await submitResult(failedTurnResult(false));

    const alert = await screen.findByText('No se pudo completar la acción');
    expect(alert.parentElement).toHaveTextContent(
      'Falló el proveedor asignado a Base 2: se agotó el tiempo de espera del proveedor.'
    );
    expect(screen.queryByText('El deployment tardó demasiado.')).not.toBeInTheDocument();
  });

  it('does not show a top alert for a failed slot continued without', async () => {
    await submitResult(failedTurnResult(true));

    expect(
      screen.queryByText(
        'Falló el proveedor asignado a Base 2: se agotó el tiempo de espera del proveedor.'
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No se pudo completar la acción')).not.toBeInTheDocument();
  });

  it('uses the fixed safe fallback for a mutation error without a failed slot', () => {
    mockExecution(null, new Error('El deployment tardó demasiado.'));
    renderWithQueryClient(<ConversationWorkspace />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No se pudo completar la solicitud');
    expect(screen.queryByText('El deployment tardó demasiado.')).not.toBeInTheDocument();
  });
});
