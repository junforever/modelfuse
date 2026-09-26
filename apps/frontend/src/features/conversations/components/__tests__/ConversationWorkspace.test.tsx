import { screen, waitFor, within } from '@testing-library/react';
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
    ['openai-5.6-sol', 'openai', 'gpt-5.6-sol', 'GPT-5.6 Sol', false],
    ['gemini-3.7-flash', 'google', 'gemini-3.7-flash', 'Gemini 3.7 Flash', false],
    ['openrouter-minimax-m3', 'openrouter', 'minimax-m3', 'MiniMax M3', true],
    ['openrouter-qwen-3.8-max', 'openrouter', 'qwen-3.8-max', 'Qwen 3.8 Max', true],
    ['direct-minimax-m3', 'minimax', 'minimax-m3', 'Direct MiniMax M3', false],
    ['direct-kimi-k3', 'kimi', 'kimi-k3', 'Direct Kimi K3', false],
  ].map(([deploymentId, providerId, modelId, displayName, supportsWebSearch]) => ({
    deploymentId: String(deploymentId),
    providerId: providerId as ModelCatalogResponse['items'][number]['providerId'],
    modelId: String(modelId),
    displayName: String(displayName),
    supportsWebSearch: Boolean(supportsWebSearch),
    contextLimitTokens: 128_000,
    maxOutputTokens: 8_192,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
  })),
};

const storedDeployments: ConversationDetail['deployments'] = [
  { ...deploymentSummaries[0], supportsWebSearch: true },
  { ...deploymentSummaries[1], supportsWebSearch: false },
  { ...deploymentSummaries[2], supportsWebSearch: false },
  { ...deploymentSummaries[3], supportsWebSearch: true },
];

function conversationDetail(): ConversationDetail {
  return {
    id: conversationId,
    title: 'Nueva conversación',
    hasWorkInProgress: false,
    createdAt: eventTime,
    updatedAt: eventTime,
    deployments: storedDeployments,
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
    turn: { ...turnFixture({ status: 'failed', responses }), webSearchEnabled: false },
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
  vi.stubGlobal('EventSource', NoopEventSource);
  api.getConversation.mockResolvedValue(conversationDetail());
  api.listAvailableDeployments.mockResolvedValue(catalog);
  api.listConversationTurns.mockResolvedValue({ items: [], olderCursor: null, hasOlder: false });
  api.listConversations.mockResolvedValue({ items: [], nextCursor: null });
  mockExecution(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ConversationWorkspace', () => {
  it('shows provider-neutral comparison guidance with a non-Qwen consolidator', () => {
    renderWithQueryClient(<ConversationWorkspace />);

    expect(
      screen.getByText(
        'Envía una consulta para comparar tres respuestas y obtener una consolidación.'
      )
    ).toBeInTheDocument();
  });

  it('enables search for a compatible selection, clears it when none support search, and forwards creation intent', async () => {
    const user = userEvent.setup();
    const execute = vi.fn();
    vi.mocked(useConversationExecution).mockReturnValue({ error: null, execute, isPending: false });
    renderWithQueryClient(<ConversationWorkspace />);

    const toggle = await screen.findByRole('switch', { name: 'Búsqueda web' });
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(toggle).toBeChecked();

    await user.click(screen.getByRole('combobox', { name: 'Base 3' }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', {
        name: 'Direct MiniMax M3 · minimax',
      })
    );
    await user.click(screen.getByRole('combobox', { name: 'Consolidador' }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', {
        name: 'Direct Kimi K3 · kimi',
      })
    );
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAttribute('tabindex', '-1');
    expect(toggle).not.toBeChecked();

    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'Busca evidencia actual');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Busca evidencia actual', webSearchEnabled: false })
    );
  });

  it('reveals new-conversation warnings immediately after enabling web search', async () => {
    const user = userEvent.setup();
    const execute = vi.fn();
    const tooltipText = 'La búsqueda web no está soportada por este modelo.';
    vi.mocked(useConversationExecution).mockReturnValue({ error: null, execute, isPending: false });
    renderWithQueryClient(<ConversationWorkspace />);

    const toggle = await screen.findByRole('switch', { name: 'Búsqueda web' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole('button', { name: tooltipText })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.getAllByRole('button', { name: tooltipText })).toHaveLength(2);
    expect(execute).not.toHaveBeenCalled();
  });

  it('reveals snapshot-only warnings immediately after enabling stored-conversation search', async () => {
    const user = userEvent.setup();
    await submitResult({
      conversation: conversationDetail(),
      turn: { ...turnFixture(), webSearchEnabled: false },
    });
    const tooltipText = 'La búsqueda web no está soportada por este modelo.';
    const toggle = screen.getByRole('switch', { name: 'Búsqueda web' });
    const incompatibleCards = ['Model 2', 'Model 3'].map(name =>
      screen.getByText(name).closest('div')
    );
    const compatibleCards = ['Model 1', 'Model 4'].map(name =>
      screen.getByText(name).closest('div')
    );

    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole('button', { name: tooltipText })).not.toBeInTheDocument();
    api.listAvailableDeployments.mockClear();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(api.listAvailableDeployments).not.toHaveBeenCalled();
    for (const card of incompatibleCards) {
      expect(card).not.toBeNull();
      const warning = within(card!).getByRole('button', { name: tooltipText });
      await user.hover(warning);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(tooltipText);
      await user.unhover(warning);
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    }
    for (const card of compatibleCards) {
      expect(card).not.toBeNull();
      expect(within(card!).queryByRole('button', { name: tooltipText })).not.toBeInTheDocument();
    }
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

class NoopEventSource {
  onerror: ((event: Event) => void) | null = null;

  constructor(_url: string | URL) {}

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}
