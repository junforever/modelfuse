import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationWorkspace } from '../components/ConversationWorkspace';
import { conversationKeys } from '../queries/conversation-keys';
import type { ConversationTurnResponse } from '../types/conversation';
import { eventTime, modelResponse, turnFixture } from '../../../test/conversation-fixtures';
import { renderWithQueryClient } from '../../../test/query-test-utils';

const api = vi.hoisted(() => ({
  createConversation: vi.fn(),
  createTurn: vi.fn(),
  getTurnSnapshot: vi.fn(),
}));

vi.mock('../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/conversationsApi')>()),
  createConversation: api.createConversation,
  createTurn: api.createTurn,
  getTurnSnapshot: api.getTurnSnapshot,
}));

const CONVERSATION_ID = '123e4567-e89b-42d3-a456-426614174078';
const FIRST_TURN_ID = '223e4567-e89b-42d3-a456-426614174078';
const SECOND_TURN_ID = '223e4567-e89b-42d3-a456-426614174079';
const FIRST_REQUEST_ID = '323e4567-e89b-42d3-a456-426614174078';
const SECOND_REQUEST_ID = '323e4567-e89b-42d3-a456-426614174079';

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

  it('keeps both turns cached by ID and replaces the active SSE stream after one idempotent follow-up', async () => {
    const user = userEvent.setup();
    const first = result(FIRST_TURN_ID, FIRST_REQUEST_ID, 1, 'Primer prompt', false);
    const second = result(SECOND_TURN_ID, SECOND_REQUEST_ID, 2, 'Segundo prompt', true);
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

    await user.type(screen.getByLabelText('Prompt'), 'Primer prompt');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('heading', { name: 'Turno 1' })).toBeInTheDocument();
    expect(api.createConversation).toHaveBeenCalledWith(expect.anything(), {
      clientRequestId: FIRST_REQUEST_ID,
      prompt: 'Primer prompt',
    });
    expect(ControlledEventSource.instances).toHaveLength(1);

    await user.clear(screen.getByLabelText('Prompt'));
    await user.type(screen.getByLabelText('Prompt'), 'Segundo prompt');
    await user.dblClick(screen.getByRole('button', { name: 'Enviar' }));

    expect(api.createTurn).toHaveBeenCalledOnce();
    expect(api.createTurn).toHaveBeenCalledWith(expect.anything(), CONVERSATION_ID, {
      clientRequestId: SECOND_REQUEST_ID,
      prompt: 'Segundo prompt',
    });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    act(() => releaseFollowUp());
    expect(await screen.findByRole('heading', { name: 'Turno 2' })).toBeInTheDocument();
    expect(screen.getByText('Primer prompt')).toBeInTheDocument();
    expect(screen.getByText('Segundo prompt')).toBeInTheDocument();

    await waitFor(() => expect(ControlledEventSource.instances).toHaveLength(2));
    expect(new URL(ControlledEventSource.instances[1]!.url).pathname).toBe(
      `/api/v1/conversations/${CONVERSATION_ID}/turns/${SECOND_TURN_ID}/events`
    );
    expect(ControlledEventSource.instances[0]!.closeCalls).toBe(1);
    expect(ControlledEventSource.instances[0]!.listenerCount()).toBe(0);

    expect(
      queryClient.getQueryData(conversationKeys.turn(CONVERSATION_ID, FIRST_TURN_ID))
    ).toMatchObject({ turnId: FIRST_TURN_ID, turn: { ordinal: 1 } });
    expect(
      queryClient.getQueryData(conversationKeys.turn(CONVERSATION_ID, SECOND_TURN_ID))
    ).toMatchObject({ turnId: SECOND_TURN_ID, turn: { ordinal: 2 } });

    unmount();
    expect(ControlledEventSource.instances[1]!.closeCalls).toBe(1);
    expect(ControlledEventSource.instances[1]!.listenerCount()).toBe(0);
    queryClient.clear();
  });
});

function result(
  turnId: string,
  clientRequestId: string,
  ordinal: number,
  prompt: string,
  hasWorkInProgress: boolean
): ConversationTurnResponse {
  return {
    conversation: {
      id: CONVERSATION_ID,
      title: 'Conversación',
      hasWorkInProgress,
      createdAt: eventTime,
      updatedAt: eventTime,
    },
    turn: turnFixture({
      id: turnId,
      clientRequestId,
      ordinal,
      prompt,
      status: hasWorkInProgress ? 'running' : 'completed',
      responses: [
        modelResponse('openai', {
          status: hasWorkInProgress ? 'running' : 'completed',
          content: hasWorkInProgress ? null : 'openai',
        }),
        modelResponse('google', {
          status: hasWorkInProgress ? 'running' : 'completed',
          content: hasWorkInProgress ? null : 'google',
        }),
        modelResponse('minimax', {
          status: hasWorkInProgress ? 'running' : 'completed',
          content: hasWorkInProgress ? null : 'minimax',
        }),
        modelResponse('qwen', {
          status: hasWorkInProgress ? 'pending' : 'completed',
          content: hasWorkInProgress ? null : 'qwen',
        }),
      ],
    }),
  };
}
