import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationWorkspace } from '../components/ConversationWorkspace';
import { conversationKeys } from '../queries/conversation-keys';
import type {
  ConversationTurnResponse,
  DeploymentIds,
  DeploymentSummaryTuple,
} from '../types/conversation';
import { eventTime, modelResponse, turnFixture } from '../../../test/conversation-fixtures';
import { renderWithQueryClient } from '../../../test/query-test-utils';

const api = vi.hoisted(() => ({
  createConversation: vi.fn(),
  createTurn: vi.fn(),
  getTurnSnapshot: vi.fn(),
  listAvailableDeployments: vi.fn(),
  listConversations: vi.fn(),
  retryResponse: vi.fn(),
}));

vi.mock('../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/conversationsApi')>()),
  createConversation: api.createConversation,
  createTurn: api.createTurn,
  getTurnSnapshot: api.getTurnSnapshot,
  listAvailableDeployments: api.listAvailableDeployments,
  listConversations: api.listConversations,
  retryResponse: api.retryResponse,
}));

const CONVERSATION_ID = '123e4567-e89b-42d3-a456-426614174078';
const FIRST_TURN_ID = '223e4567-e89b-42d3-a456-426614174078';
const SECOND_TURN_ID = '223e4567-e89b-42d3-a456-426614174079';
const FIRST_REQUEST_ID = '323e4567-e89b-42d3-a456-426614174078';
const SECOND_REQUEST_ID = '323e4567-e89b-42d3-a456-426614174079';
const DEPLOYMENT_IDS: DeploymentIds = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
};
const DEPLOYMENTS: DeploymentSummaryTuple = [
  {
    slot: 'base-1',
    deploymentId: DEPLOYMENT_IDS['base-1'],
    providerId: 'openai',
    modelId: 'gpt-5.6',
    displayName: 'GPT-5.6 Sol',
    supportsWebSearch: false,
  },
  {
    slot: 'base-2',
    deploymentId: DEPLOYMENT_IDS['base-2'],
    providerId: 'google',
    modelId: 'gemini-3.7-flash',
    displayName: 'Gemini 3.7 Flash',
    supportsWebSearch: false,
  },
  {
    slot: 'base-3',
    deploymentId: DEPLOYMENT_IDS['base-3'],
    providerId: 'openrouter',
    modelId: 'minimax/m3',
    displayName: 'MiniMax M3',
    supportsWebSearch: true,
  },
  {
    slot: 'consolidator',
    deploymentId: DEPLOYMENT_IDS.consolidator,
    providerId: 'openrouter',
    modelId: 'qwen/qwen3.8-max-0902',
    displayName: 'Qwen 3.8 Max',
    supportsWebSearch: true,
  },
];
const CATALOG = {
  items: DEPLOYMENTS.map(
    ({ deploymentId, providerId, modelId, displayName, supportsWebSearch }) => ({
      deploymentId,
      providerId,
      modelId,
      displayName,
      supportsWebSearch,
      contextLimitTokens: 128_000,
      maxOutputTokens: 8_192,
      inputModalities: ['text'] as const,
      outputModalities: ['text'] as const,
    })
  ),
};

type Listener = (event: MessageEvent<string>) => void;

class ControlledEventSource {
  static instances: ControlledEventSource[] = [];
  readonly url: string;
  closeCalls = 0;
  onerror: ((event: Event) => void) | null = null;
  private closed = false;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    ControlledEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.closeCalls += 1;
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

describe('conversation continuation frontend integration', () => {
  beforeEach(() => {
    api.createConversation.mockReset();
    api.createTurn.mockReset();
    api.getTurnSnapshot.mockReset();
    api.listAvailableDeployments.mockReset();
    api.listConversations.mockReset();
    api.retryResponse.mockReset();
    api.listAvailableDeployments.mockResolvedValue(CATALOG);
    api.listConversations.mockResolvedValue({ items: [], nextCursor: null });
    ControlledEventSource.instances = [];
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1');
    vi.stubGlobal('EventSource', ControlledEventSource);
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce(FIRST_REQUEST_ID)
      .mockReturnValueOnce(SECOND_REQUEST_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards an explicit, independently chosen web-search value exactly once per turn', async () => {
    const user = userEvent.setup();
    const first = result(FIRST_TURN_ID, FIRST_REQUEST_ID, 1, 'Primer prompt', false, false);
    const second = result(SECOND_TURN_ID, SECOND_REQUEST_ID, 2, 'Segundo prompt', true, true);
    let releaseFollowUp!: () => void;
    const followUpGate = new Promise<ConversationTurnResponse>(resolve => {
      releaseFollowUp = () => resolve(second);
    });
    api.createConversation.mockResolvedValue(first);
    api.createTurn.mockReturnValue(followUpGate);
    api.getTurnSnapshot.mockImplementation(
      async (_client: unknown, _conversationId: string, turnId: string) => {
        const selected = turnId === FIRST_TURN_ID ? first : second;
        return {
          conversation: {
            id: selected.conversation.id,
            hasWorkInProgress: selected.conversation.hasWorkInProgress,
          },
          turn: selected.turn,
        };
      }
    );
    const { queryClient, unmount } = renderWithQueryClient(<ConversationWorkspace />);

    const firstTurnToggle = await screen.findByRole('switch', { name: 'Búsqueda web' });
    expect(firstTurnToggle).toBeEnabled();
    await user.click(firstTurnToggle);
    await user.click(firstTurnToggle);
    expect(firstTurnToggle).not.toBeChecked();
    await user.type(screen.getByLabelText('Prompt'), 'Primer prompt');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('heading', { name: 'Turno 1' })).toBeInTheDocument();
    expect(api.createConversation).toHaveBeenCalledOnce();
    expect(api.createConversation).toHaveBeenCalledWith(expect.anything(), {
      clientRequestId: FIRST_REQUEST_ID,
      prompt: 'Primer prompt',
      webSearchEnabled: false,
      deploymentIds: DEPLOYMENT_IDS,
    });
    expect(ControlledEventSource.instances).toHaveLength(0);

    const secondTurnToggle = screen.getByRole('switch', { name: 'Búsqueda web' });
    await user.click(secondTurnToggle);
    expect(secondTurnToggle).toBeChecked();
    await user.clear(screen.getByLabelText('Prompt'));
    await user.type(screen.getByLabelText('Prompt'), 'Segundo prompt');
    await user.dblClick(screen.getByRole('button', { name: 'Enviar' }));

    expect(api.createTurn).toHaveBeenCalledOnce();
    expect(api.createTurn).toHaveBeenCalledWith(expect.anything(), CONVERSATION_ID, {
      clientRequestId: SECOND_REQUEST_ID,
      prompt: 'Segundo prompt',
      webSearchEnabled: true,
    });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    act(() => releaseFollowUp());
    expect(await screen.findByRole('heading', { name: 'Turno 2' })).toBeInTheDocument();
    const conversationHistory = screen.getByRole('region', {
      name: 'Historial de conversación',
    });
    expect(within(conversationHistory).getByText('Primer prompt')).toBeInTheDocument();
    expect(within(conversationHistory).getByText('Segundo prompt')).toBeInTheDocument();

    await waitFor(() => expect(ControlledEventSource.instances).toHaveLength(1));
    expect(new URL(ControlledEventSource.instances[0]!.url).pathname).toBe(
      `/api/v1/conversations/${CONVERSATION_ID}/turns/${SECOND_TURN_ID}/events`
    );

    expect(
      queryClient.getQueryData(conversationKeys.turn(CONVERSATION_ID, FIRST_TURN_ID))
    ).toMatchObject({ turnId: FIRST_TURN_ID, turn: { ordinal: 1 } });
    expect(
      queryClient.getQueryData(conversationKeys.turn(CONVERSATION_ID, SECOND_TURN_ID))
    ).toMatchObject({ turnId: SECOND_TURN_ID, turn: { ordinal: 2 } });

    unmount();
    expect(ControlledEventSource.instances[0]!.closeCalls).toBe(1);
    expect(ControlledEventSource.instances[0]!.listenerCount()).toBe(0);
    queryClient.clear();
  });

  it('retries the canonical slot without sending a replacement assignment', async () => {
    const user = userEvent.setup();
    const failed = failedFirstResponse();
    api.createConversation.mockResolvedValue(failed);
    api.retryResponse.mockResolvedValue(
      result(FIRST_TURN_ID, FIRST_REQUEST_ID, 1, 'Primer prompt', false)
    );
    const { queryClient, unmount } = renderWithQueryClient(<ConversationWorkspace />);

    await user.type(screen.getByLabelText('Prompt'), 'Primer prompt');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    const retry = await screen.findByRole('button', {
      name: 'Reintentar Base 1 · GPT-5.6 Sol',
    });
    await user.click(retry);

    await waitFor(() => expect(api.retryResponse).toHaveBeenCalledOnce());
    expect(api.retryResponse).toHaveBeenCalledWith(
      expect.anything(),
      CONVERSATION_ID,
      FIRST_TURN_ID,
      'base-1'
    );
    expect(api.retryResponse.mock.calls[0]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ deploymentIds: expect.anything() })])
    );

    unmount();
    queryClient.clear();
  });
});

function failedFirstResponse(): ConversationTurnResponse {
  const completed = result(FIRST_TURN_ID, FIRST_REQUEST_ID, 1, 'Primer prompt', false);
  return {
    ...completed,
    turn: {
      ...completed.turn,
      status: 'partial',
      responses: [
        modelResponse('base-1', {
          status: 'failed',
          error: { code: 'timeout', message: 'El deployment tardó demasiado.' },
          recoverable: true,
        }),
        modelResponse('base-2', { status: 'completed', content: 'base-2' }),
        modelResponse('base-3', { status: 'completed', content: 'base-3' }),
        modelResponse('consolidator', { status: 'completed', content: 'consolidator' }),
      ],
    },
  };
}

function result(
  turnId: string,
  clientRequestId: string,
  ordinal: number,
  prompt: string,
  hasWorkInProgress: boolean,
  webSearchEnabled = false
): ConversationTurnResponse {
  return {
    conversation: {
      id: CONVERSATION_ID,
      title: 'Conversación',
      deployments: DEPLOYMENTS,
      hasWorkInProgress,
      createdAt: eventTime,
      updatedAt: eventTime,
    },
    turn: turnFixture({
      id: turnId,
      clientRequestId,
      ordinal,
      prompt,
      webSearchEnabled,
      status: hasWorkInProgress ? 'running' : 'completed',
      responses: [
        modelResponse('base-1', {
          status: hasWorkInProgress ? 'running' : 'completed',
          content: hasWorkInProgress ? null : 'base-1',
        }),
        modelResponse('base-2', {
          status: hasWorkInProgress ? 'running' : 'completed',
          content: hasWorkInProgress ? null : 'base-2',
        }),
        modelResponse('base-3', {
          status: hasWorkInProgress ? 'running' : 'completed',
          content: hasWorkInProgress ? null : 'base-3',
        }),
        modelResponse('consolidator', {
          status: hasWorkInProgress ? 'pending' : 'completed',
          content: hasWorkInProgress ? null : 'consolidator',
        }),
      ],
    }),
  };
}
