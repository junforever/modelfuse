import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../../App';
import { eventTime, modelResponse, turnFixture } from '../../../test/conversation-fixtures';
import { ControlledIntersectionObserver } from '../../../test/controlledIntersectionObserver';
import { renderWithQueryClient } from '../../../test/query-test-utils';
import type {
  ConversationPage,
  ConversationSummary,
  Turn,
  TurnPage,
} from '../types/conversation';

const api = vi.hoisted(() => ({
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  listConversationTurns: vi.fn(),
  listConversations: vi.fn(),
  renameConversation: vi.fn(),
}));

vi.mock('../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/conversationsApi')>()),
  ...api,
}));

const CONVERSATION_ID = 'a0000000-0000-4000-8000-000000000092';

describe('conversation history frontend integration', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset());
    ControlledIntersectionObserver.reset();
    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver);
    vi.stubGlobal('EventSource', NoopEventSource);
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1');
    vi.stubEnv('VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD', '40');
    api.getConversation.mockResolvedValue(summary('Conversación 1'));
    api.listConversationTurns.mockResolvedValue(turnPage([5, 6, 7], null));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('distinguishes sidebar loading, empty, error with retry, and success', async () => {
    const user = userEvent.setup();
    const initial = deferred<ConversationPage>();
    api.listConversations.mockReturnValueOnce(initial.promise);
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    expect(screen.getByRole('status', { name: 'Cargando conversaciones' })).toBeInTheDocument();
    expect(screen.queryByText(/^No hay conversaciones guardadas\.?$/)).not.toBeInTheDocument();

    await act(async () => {
      initial.resolve({ items: [], nextCursor: null });
      await initial.promise;
    });
    expect(await screen.findByText(/^No hay conversaciones guardadas\.?$/)).toBeInTheDocument();
    unmount();
    queryClient.clear();

    api.listConversations.mockRejectedValueOnce(new Error('transport detail'));
    api.listConversations.mockResolvedValueOnce({
      items: [summary('Recuperada')],
      nextCursor: null,
    });
    const rerendered = renderWithQueryClient(<App />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar las conversaciones');
    expect(alert).not.toHaveTextContent('transport detail');

    await user.click(within(alert).getByRole('button', { name: 'Reintentar conversaciones' }));
    expect(
      await screen.findByRole('button', { name: /^Recuperada$/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^No hay conversaciones guardadas\.?$/)).not.toBeInTheDocument();
    rerendered.unmount();
    rerendered.queryClient.clear();
  });

  it('autofills a short sidebar and appends pages without duplicating a pending load', async () => {
    const pending = deferred<ConversationPage>();
    api.listConversations
      .mockResolvedValueOnce({ items: [summary('Página 1')], nextCursor: 'next-1' })
      .mockReturnValueOnce(pending.promise);
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    expect(
      await screen.findByRole('button', { name: /^Página 1$/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.listConversations).toHaveBeenCalledTimes(2));
    const sentinel = screen.getByLabelText('Cargar más conversaciones');
    act(() => {
      ControlledIntersectionObserver.intersect(sentinel);
      ControlledIntersectionObserver.intersect(sentinel);
    });
    expect(api.listConversations).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.resolve({ items: [summary('Página 2', false, 'a0000000-0000-4000-8000-000000000093')], nextCursor: null });
      await pending.promise;
    });
    expect(
      await screen.findByRole('button', { name: /^Página 2$/ }),
    ).toBeInTheDocument();
    expect(
      ['Página 1', 'Página 2'].map(name =>
        screen.getByRole('button', { name: exactName(name) }),
      ),
    ).toHaveLength(2);
    unmount();
    queryClient.clear();
  });

  it('keeps visible sidebar data after an incremental error and retries manually', async () => {
    const failedPage = deferred<ConversationPage>();
    api.listConversations
      .mockResolvedValueOnce({ items: [summary('Visible')], nextCursor: 'next-1' })
      .mockReturnValueOnce(failedPage.promise)
      .mockResolvedValueOnce({
        items: [summary('Añadida', false, 'a0000000-0000-4000-8000-000000000093')],
        nextCursor: null,
      });
    const user = userEvent.setup();
    const { queryClient, unmount } = renderWithQueryClient(<App />);
    const visible = await screen.findByRole('button', { name: /^Visible$/ });
    const sentinel = screen.getByLabelText('Cargar más conversaciones');

    act(() => ControlledIntersectionObserver.intersect(sentinel));
    expect(api.listConversations).toHaveBeenCalledTimes(2);
    await act(async () => {
      failedPage.reject(new Error('incremental detail'));
      await expect(failedPage.promise).rejects.toThrow('incremental detail');
    });

    expect(visible).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar más conversaciones');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar conversaciones' }));

    expect(
      await screen.findByRole('button', { name: /^Añadida$/ }),
    ).toBeInTheDocument();
    expect(
      ['Visible', 'Añadida'].map(name =>
        screen.getByRole('button', { name: exactName(name) }),
      ),
    ).toHaveLength(2);
    unmount();
    queryClient.clear();
  });

  it('prepends history after a manual retry, preserves content and compensates scroll once', async () => {
    const failedOlder = deferred<TurnPage>();
    const retriedOlder = deferred<TurnPage>();
    api.listConversations.mockResolvedValue({ items: [summary('Con historial')], nextCursor: null });
    api.listConversationTurns
      .mockResolvedValueOnce(turnPage([5, 6, 7], 'older-5'))
      .mockReturnValueOnce(failedOlder.promise)
      .mockReturnValueOnce(retriedOlder.promise);
    const user = userEvent.setup();
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    await user.click(
      await screen.findByRole('button', { name: /^Con historial$/ }),
    );
    expect(await screen.findByRole('heading', { name: 'Turno 7' })).toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'Historial de conversación' });
    let scrollHeight = 300;
    Object.defineProperty(history, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(history, 'clientHeight', { configurable: true, value: 200 });
    history.scrollTop = 40;
    const sentinel = screen.getByLabelText('Cargar turnos anteriores');

    act(() => {
      ControlledIntersectionObserver.intersect(sentinel);
      ControlledIntersectionObserver.intersect(sentinel);
    });
    expect(api.listConversationTurns).toHaveBeenCalledTimes(2);
    await act(async () => {
      failedOlder.reject(new Error('incremental detail'));
      await expect(failedOlder.promise).rejects.toThrow('incremental detail');
    });

    expect(screen.getByRole('heading', { name: 'Turno 7' })).toBeInTheDocument();
    expect(within(history).getAllByRole('listitem')).toHaveLength(3);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar turnos anteriores');

    await user.click(within(alert).getByRole('button', { name: 'Reintentar historial' }));
    scrollHeight = 600;
    await act(async () => {
      retriedOlder.resolve(turnPage([2, 3, 4], 'older-2'));
      await retriedOlder.promise;
    });

    expect(await screen.findByRole('heading', { name: 'Turno 2' })).toBeInTheDocument();
    expect(within(history).getAllByRole('listitem')).toHaveLength(6);
    expect(history.scrollTop).toBe(340);
    expect(api.listConversationTurns).toHaveBeenCalledTimes(3);
    unmount();
    queryClient.clear();
  });
});

function summary(
  title: string,
  hasWorkInProgress = false,
  id = CONVERSATION_ID,
): ConversationSummary {
  return { id, title, hasWorkInProgress, createdAt: eventTime, updatedAt: eventTime };
}

function turnPage(ordinals: readonly number[], olderCursor: string | null): TurnPage {
  return {
    items: ordinals.map(turn),
    olderCursor,
    hasOlder: olderCursor !== null,
  };
}

function turn(ordinal: number): Turn {
  return turnFixture({
    id: `b0000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`,
    clientRequestId: `c0000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`,
    ordinal,
    prompt: `prompt-${ordinal}`,
    status: 'completed',
    responses: [
      modelResponse('openai', { status: 'completed', content: `openai-${ordinal}` }),
      modelResponse('google', { status: 'completed', content: `google-${ordinal}` }),
      modelResponse('minimax', { status: 'completed', content: `minimax-${ordinal}` }),
      modelResponse('qwen', { status: 'completed', content: `qwen-${ordinal}` }),
    ],
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function exactName(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

class NoopEventSource {
  onerror: ((event: Event) => void) | null = null;

  constructor(_url: string | URL) {}

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}
