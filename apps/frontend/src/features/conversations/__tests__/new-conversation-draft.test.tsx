import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../../App';
import { eventTime, modelResponse, turnFixture } from '../../../test/conversation-fixtures';
import { renderWithQueryClient } from '../../../test/query-test-utils';
import type { ConversationSummary } from '../types/conversation';

const api = vi.hoisted(() => ({
  createConversation: vi.fn(),
  createTurn: vi.fn(),
  getConversation: vi.fn(),
  listConversationTurns: vi.fn(),
  listConversations: vi.fn(),
}));

vi.mock('../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/conversationsApi')>()),
  ...api,
}));

const FIRST_ID = 'd0000000-0000-4000-8000-000000000104';
const SECOND_ID = 'd0000000-0000-4000-8000-000000000105';

describe('new conversation draft', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset());
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1');
    vi.stubGlobal('EventSource', NoopEventSource);

    api.listConversations.mockResolvedValue({
      items: [summary(FIRST_ID, 'Conversación anterior'), summary(SECOND_ID, 'Conversación conservada')],
      nextCursor: null,
    });
    api.getConversation.mockResolvedValue(summary(FIRST_ID, 'Conversación anterior'));
    api.listConversationTurns.mockResolvedValue({
      items: [
        turnFixture({
          prompt: 'Contexto anterior',
          status: 'completed',
          responses: [
            modelResponse('openai', { status: 'completed', content: 'OpenAI anterior' }),
            modelResponse('google', { status: 'completed', content: 'Google anterior' }),
            modelResponse('minimax', { status: 'completed', content: 'MiniMax anterior' }),
            modelResponse('qwen', { status: 'completed', content: 'Qwen anterior' }),
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

class NoopEventSource {
  onerror: ((event: Event) => void) | null = null;

  constructor(_url: string | URL) {}

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}
