import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import type { PropsWithChildren } from 'react';

import { App } from '../../../App';
import { eventTime, modelResponse, turnFixture } from '../../../test/conversation-fixtures';
import { renderWithQueryClient } from '../../../test/query-test-utils';
import { createTestQueryClient } from '../../../test/query-test-utils';
import { ResponseTabs } from '../components/ResponseTabs';
import { useConversationExecution } from '../hooks/useConversationExecution';
import type {
  ConversationDetail,
  ConversationSummary,
  DeploymentIds,
} from '../types/conversation';

const api = vi.hoisted(() => ({
  createConversation: vi.fn(),
  createTurn: vi.fn(),
  getConversation: vi.fn(),
  listAvailableDeployments: vi.fn(),
  listConversationTurns: vi.fn(),
  listConversations: vi.fn(),
}));

vi.mock('../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/conversationsApi')>()),
  ...api,
}));

const FIRST_ID = 'd0000000-0000-4000-8000-000000000104';
const SECOND_ID = 'd0000000-0000-4000-8000-000000000105';
const deploymentIds: DeploymentIds = {
  'base-1': 'deployment-1',
  'base-2': 'deployment-2',
  'base-3': 'deployment-3',
  consolidator: 'deployment-4',
};
const defaultDeploymentIds: DeploymentIds = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
};

describe('new conversation draft', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset());
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1');
    vi.stubGlobal('EventSource', NoopEventSource);

    api.listConversations.mockResolvedValue({
      items: [summary(FIRST_ID, 'Conversación anterior'), summary(SECOND_ID, 'Conversación conservada')],
      nextCursor: null,
    });
    api.listAvailableDeployments.mockResolvedValue({ items: catalogItems() });
    api.getConversation.mockResolvedValue(detail(FIRST_ID, 'Conversación anterior'));
    api.listConversationTurns.mockResolvedValue({
      items: [
        turnFixture({
          prompt: 'Contexto anterior',
          status: 'completed',
          responses: [
            modelResponse('base-1', { status: 'completed', content: 'Base 1 anterior' }),
            modelResponse('base-2', { status: 'completed', content: 'Base 2 anterior' }),
            modelResponse('base-3', { status: 'completed', content: 'Base 3 anterior' }),
            modelResponse('consolidator', { status: 'completed', content: 'Consolidación anterior' }),
          ],
        }),
      ],
      olderCursor: null,
      hasOlder: false,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps one empty local draft without persisting or changing saved conversations after repeated clicks', async () => {
    const user = userEvent.setup();
    const { queryClient, unmount } = renderWithQueryClient(<App />);
    const previousConversation = await screen.findByRole('button', {
      name: 'Conversación anterior',
    });

    await user.click(previousConversation);
    expect(await screen.findByText('Contexto anterior')).toBeInTheDocument();

    const newConversation = screen.getByRole('button', { name: 'Nueva conversación' });
    await user.click(newConversation);
    await user.click(newConversation);

    const promptInputs = screen.getAllByRole('textbox', { name: 'Prompt' });
    expect(promptInputs).toHaveLength(1);
    expect(promptInputs[0]).toHaveValue('');
    expect(screen.queryByText('Contexto anterior')).not.toBeInTheDocument();

    const sidebar = screen.getByRole('navigation', { name: 'Conversaciones' });
    const savedConversations = [
      within(sidebar).getByRole('button', { name: 'Conversación anterior' }),
      within(sidebar).getByRole('button', { name: 'Conversación conservada' }),
    ];
    savedConversations.forEach(button => expect(button).not.toHaveAttribute('aria-current'));
    expect(api.createConversation).not.toHaveBeenCalled();
    expect(api.createTurn).not.toHaveBeenCalled();

    unmount();
    queryClient.clear();
  });

  it('preselects and submits the exact complete default profile for a new draft', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('623e4567-e89b-42d3-a456-426614174000');
    api.createConversation.mockResolvedValue({
      conversation: detail(FIRST_ID, 'Nueva'),
      turn: turnFixture(),
    });
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Base 1' })).toHaveTextContent('openai-5.6-sol');
      expect(screen.getByRole('combobox', { name: 'Base 2' })).toHaveTextContent('gemini-3.7-flash');
      expect(screen.getByRole('combobox', { name: 'Base 3' })).toHaveTextContent('openrouter-minimax-m3');
      expect(screen.getByRole('combobox', { name: 'Consolidador' })).toHaveTextContent('openrouter-qwen-3.8-max');
    });

    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'Usar perfil completo');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(api.createConversation).toHaveBeenCalledWith(expect.anything(), {
      clientRequestId: '623e4567-e89b-42d3-a456-426614174000',
      prompt: 'Usar perfil completo',
      deploymentIds: defaultDeploymentIds,
    }));

    unmount();
    queryClient.clear();
  });

  it('leaves every selector empty and blocks creation when the exact default is incomplete', async () => {
    const user = userEvent.setup();
    api.listAvailableDeployments.mockResolvedValue({
      items: [
        ...catalogItems().slice(0, 3),
        catalogItem('openrouter-qwen-alternative', 'Qwen alternativo', 'openrouter'),
      ],
    });
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    await waitFor(() => {
      for (const selector of screen.getAllByRole('combobox')) {
        expect(selector).toBeEnabled();
        expect(selector).toHaveTextContent('Selecciona un deployment');
      }
    });
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'Requiere selección');

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(api.createConversation).not.toHaveBeenCalled();

    unmount();
    queryClient.clear();
  });

  it('sends deploymentIds only for creation and strips them from continuation payloads', async () => {
    const queryClient = createTestQueryClient();
    const onSuccess = vi.fn();
    const client = {} as AxiosInstance;
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string | null }) =>
        useConversationExecution({ apiClient: client, conversationId, onSuccess }),
      { initialProps: { conversationId: null }, wrapper },
    );
    const creationResult = { conversation: detail(FIRST_ID, 'Nueva'), turn: turnFixture() };
    api.createConversation.mockResolvedValue(creationResult);
    api.createTurn.mockResolvedValue(creationResult);

    act(() => result.current.execute({
      clientRequestId: '423e4567-e89b-42d3-a456-426614174000',
      prompt: 'Crear',
      deploymentIds,
    }));
    await waitFor(() => expect(api.createConversation).toHaveBeenCalledWith(client, {
      clientRequestId: '423e4567-e89b-42d3-a456-426614174000',
      prompt: 'Crear',
      deploymentIds,
    }));
    await waitFor(() => expect(result.current.isPending).toBe(false));

    rerender({ conversationId: FIRST_ID });
    act(() => result.current.execute({
      clientRequestId: '523e4567-e89b-42d3-a456-426614174000',
      prompt: 'Continuar',
      deploymentIds,
    }));
    await waitFor(() => expect(api.createTurn).toHaveBeenCalledWith(client, FIRST_ID, {
      clientRequestId: '523e4567-e89b-42d3-a456-426614174000',
      prompt: 'Continuar',
    }));

    unmount();
    queryClient.clear();
  });

  it('renders response tabs with only the four canonical logical slots', () => {
    render(
      <ResponseTabs
        responses={turnFixture().responses}
        runtimeStages={{}}
        hasWorkInProgress={false}
        onRetry={vi.fn()}
        onContinueWithout={vi.fn()}
      />
    );

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Base 1',
      'Base 2',
      'Base 3',
      'Consolidador',
    ]);
  });
});

function summary(id: string, title: string): ConversationSummary {
  return {
    id,
    title,
    hasWorkInProgress: false,
    createdAt: eventTime,
    updatedAt: eventTime,
  };
}

function detail(id: string, title: string): ConversationDetail {
  return {
    ...summary(id, title),
    deployments: [
      { slot: 'base-1', deploymentId: 'deployment-1', providerId: 'openai', modelId: 'model-1', displayName: 'GPT' },
      { slot: 'base-2', deploymentId: 'deployment-2', providerId: 'google', modelId: 'model-2', displayName: 'Gemini' },
      { slot: 'base-3', deploymentId: 'deployment-3', providerId: 'openrouter', modelId: 'model-3', displayName: 'MiniMax' },
      { slot: 'consolidator', deploymentId: 'deployment-4', providerId: 'openrouter', modelId: 'model-4', displayName: 'Qwen' },
    ],
  };
}

function catalogItems() {
  return [
    catalogItem('openai-5.6-sol', 'GPT-5.6 Sol', 'openai'),
    catalogItem('gemini-3.7-flash', 'Gemini 3.7 Flash', 'google'),
    catalogItem('openrouter-minimax-m3', 'MiniMax M3', 'openrouter'),
    catalogItem('openrouter-qwen-3.8-max', 'Qwen 3.8 Max', 'openrouter'),
  ];
}

function catalogItem(
  deploymentId: string,
  displayName: string,
  providerId: 'openai' | 'google' | 'openrouter',
) {
  return {
    deploymentId,
    displayName,
    providerId,
    modelId: `${deploymentId}-model`,
    contextLimitTokens: 100_000,
    maxOutputTokens: 8_000,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
  };
}

class NoopEventSource {
  onerror: ((event: Event) => void) | null = null;

  constructor(_url: string | URL) {}

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}
