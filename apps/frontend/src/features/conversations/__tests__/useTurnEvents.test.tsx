import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTurnEvents } from '../hooks/useTurnEvents';
import { conversationKeys } from '../queries/conversation-keys';
import {
  conversationId,
  eventTime,
  modelResponse,
  turnId,
  turnFixture,
  turnSnapshotFixture,
} from '../../../test/conversation-fixtures';
import { createTestQueryClient } from '../../../test/query-test-utils';
import type { ConversationDetail, DeploymentSummaryTuple } from '../types/conversation';
import type { TurnEventSnapshot } from '../types/sse';

const DEPLOYMENTS: DeploymentSummaryTuple = [
  {
    slot: 'base-1',
    deploymentId: 'stored-base-1',
    providerId: 'openai',
    modelId: 'stored-gpt',
    displayName: 'Stored GPT',
    supportsWebSearch: false,
  },
  {
    slot: 'base-2',
    deploymentId: 'stored-base-2',
    providerId: 'google',
    modelId: 'stored-gemini',
    displayName: 'Stored Gemini',
    supportsWebSearch: false,
  },
  {
    slot: 'base-3',
    deploymentId: 'stored-base-3',
    providerId: 'openrouter',
    modelId: 'stored-minimax',
    displayName: 'Stored MiniMax',
    supportsWebSearch: true,
  },
  {
    slot: 'consolidator',
    deploymentId: 'stored-consolidator',
    providerId: 'openrouter',
    modelId: 'stored-qwen',
    displayName: 'Stored Qwen',
    supportsWebSearch: true,
  },
];

function snapshotFixture(overrides: Partial<TurnEventSnapshot> = {}): TurnEventSnapshot {
  return turnSnapshotFixture({ deployments: DEPLOYMENTS, ...overrides });
}

type EventListener = (event: MessageEvent<string>) => void;

class ControlledEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: ControlledEventSource[] = [];

  readonly url: string;
  readonly withCredentials = false;
  readyState = ControlledEventSource.OPEN;
  closeCalls = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    ControlledEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  close() {
    if (this.readyState === ControlledEventSource.CLOSED) return;
    this.readyState = ControlledEventSource.CLOSED;
    this.closeCalls += 1;
  }

  emit(type: 'slot_update' | 'turn_update' | 'busy_update', data: unknown) {
    if (this.readyState === ControlledEventSource.CLOSED) return;
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  fail() {
    if (this.readyState === ControlledEventSource.CLOSED) return;
    const event = new Event('error');
    this.onerror?.(event);
    for (const listener of this.listeners.get('error') ?? [])
      listener(event as MessageEvent<string>);
  }
}

function TurnEventsProbe() {
  const { runtimeStages, error } = useTurnEvents({ conversationId, turnId });

  return (
    <>
      <output aria-label="Etapa de Base 1">{runtimeStages['base-1'] ?? ''}</output>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

function slotUpdate(
  eventSequence: number,
  overrides: Parameters<typeof modelResponse<'base-1'>>[1] = {},
  runtimeStage?: string
) {
  return {
    conversationId,
    turnId,
    eventSequence,
    response: modelResponse('base-1', overrides),
    ...(runtimeStage ? { runtimeStage } : {}),
  };
}

describe('useTurnEvents integration', () => {
  beforeEach(() => {
    ControlledEventSource.instances = [];
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1');
    vi.stubGlobal('EventSource', ControlledEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses one stream, orders canonical updates and converges once after terminal state', () => {
    const queryClient = createTestQueryClient();
    const initial = snapshotFixture();
    queryClient.setQueryData(conversationKeys.turn(conversationId, turnId), initial);
    queryClient.setQueryData(conversationKeys.detail(conversationId), {
      id: conversationId,
      title: 'Comparación',
      deployments: DEPLOYMENTS,
      hasWorkInProgress: true,
      createdAt: eventTime,
      updatedAt: eventTime,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const view = render(
      <QueryClientProvider client={queryClient}>
        <TurnEventsProbe />
      </QueryClientProvider>
    );

    expect(ControlledEventSource.instances).toHaveLength(1);
    const source = ControlledEventSource.instances[0]!;
    expect(new URL(source.url, 'http://localhost').pathname).toBe(
      `/api/v1/conversations/${conversationId}/turns/${turnId}/events`
    );

    act(() => {
      source.emit('slot_update', slotUpdate(11, {}, 'Pensando…'));
    });
    expect(screen.getByLabelText('Etapa de Base 1')).toHaveTextContent('Pensando…');

    act(() => {
      source.emit(
        'slot_update',
        slotUpdate(11, { status: 'completed', content: 'duplicado ignorado' })
      );
      source.emit(
        'slot_update',
        slotUpdate(10, { status: 'completed', content: 'anterior ignorado' })
      );
      source.emit(
        'slot_update',
        slotUpdate(12, {
          status: 'completed',
          content: 'respuesta canónica',
          completedAt: eventTime,
        })
      );
    });

    const cached = queryClient.getQueryData<TurnEventSnapshot>(
      conversationKeys.turn(conversationId, turnId)
    );
    expect(cached?.lastEventSequence).toBe(12);
    expect(cached?.deployments).toBe(DEPLOYMENTS);
    expect(cached?.turn.responses[0]).toMatchObject({
      slot: 'base-1',
      content: 'respuesta canónica',
      attemptNo: 1,
    });
    expect(screen.getByLabelText('Etapa de Base 1')).toBeEmptyDOMElement();

    act(() => {
      source.emit('turn_update', {
        conversationId,
        turnId,
        eventSequence: 13,
        turn: { id: turnId, status: 'completed', updatedAt: eventTime },
      });
    });
    expect(source.closeCalls).toBe(0);

    act(() => {
      source.emit('busy_update', {
        conversationId,
        turnId,
        eventSequence: 14,
        hasWorkInProgress: false,
        updatedAt: eventTime,
      });
    });

    expect(source.closeCalls).toBe(1);
    expect(screen.getByLabelText('Etapa de Base 1')).toBeEmptyDOMElement();
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationKeys.detail(conversationId) });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: conversationKeys.turn(conversationId, turnId),
    });
    expect(
      queryClient.getQueryData<ConversationDetail>(conversationKeys.detail(conversationId))
        ?.deployments
    ).toBe(DEPLOYMENTS);

    view.unmount();
    expect(source.listenerCount()).toBe(0);
    expect(source.onerror).toBeNull();
    queryClient.clear();
  });

  it('hydrates the complete snapshot when all six projections share one sequence', () => {
    const queryClient = createTestQueryClient();
    const previousTime = '2026-07-26T20:00:00.000Z';
    queryClient.setQueryData(
      conversationKeys.turn(conversationId, turnId),
      snapshotFixture({
        turn: turnFixture({
          status: 'pending',
          updatedAt: previousTime,
          responses: [
            modelResponse('base-1', { status: 'pending', updatedAt: previousTime }),
            modelResponse('base-2', { status: 'pending', updatedAt: previousTime }),
            modelResponse('base-3', { status: 'pending', updatedAt: previousTime }),
            modelResponse('consolidator', { status: 'pending', updatedAt: previousTime }),
          ],
        }),
        hasWorkInProgress: false,
        updatedAt: previousTime,
        lastEventSequence: 0,
      })
    );
    queryClient.setQueryData(conversationKeys.detail(conversationId), {
      id: conversationId,
      title: 'Comparación',
      deployments: DEPLOYMENTS,
      hasWorkInProgress: false,
      createdAt: previousTime,
      updatedAt: previousTime,
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <TurnEventsProbe />
      </QueryClientProvider>
    );
    const source = ControlledEventSource.instances[0]!;
    const snapshotSequence = 20;
    const snapshotResponses = [
      modelResponse('base-1', {
        status: 'completed',
        content: 'snapshot OpenAI',
        completedAt: eventTime,
      }),
      modelResponse('base-2', {
        status: 'completed',
        content: 'snapshot Google',
        completedAt: eventTime,
      }),
      modelResponse('base-3', {
        status: 'failed',
        error: { code: 'authentication', message: 'snapshot MiniMax' },
        completedAt: eventTime,
      }),
      modelResponse('consolidator', { status: 'running' }),
    ] as const;

    act(() => {
      for (const response of snapshotResponses) {
        source.emit('slot_update', {
          conversationId,
          turnId,
          eventSequence: snapshotSequence,
          response,
        });
      }
      source.emit('turn_update', {
        conversationId,
        turnId,
        eventSequence: snapshotSequence,
        turn: { id: turnId, status: 'running', updatedAt: eventTime },
      });
      source.emit('busy_update', {
        conversationId,
        turnId,
        eventSequence: snapshotSequence,
        hasWorkInProgress: true,
        updatedAt: eventTime,
      });
    });

    let cached = queryClient.getQueryData<TurnEventSnapshot>(
      conversationKeys.turn(conversationId, turnId)
    )!;
    expect(
      cached.turn.responses.map(({ slot, status, content }) => ({ slot, status, content }))
    ).toEqual([
      { slot: 'base-1', status: 'completed', content: 'snapshot OpenAI' },
      { slot: 'base-2', status: 'completed', content: 'snapshot Google' },
      { slot: 'base-3', status: 'failed', content: null },
      { slot: 'consolidator', status: 'running', content: null },
    ]);
    expect(cached).toMatchObject({
      lastEventSequence: snapshotSequence,
      hasWorkInProgress: true,
      turn: { status: 'running', updatedAt: eventTime },
    });
    const detail = queryClient.getQueryData<ConversationDetail>(
      conversationKeys.detail(conversationId)
    );
    expect(detail).toMatchObject({ hasWorkInProgress: true });
    expect(detail?.deployments).toBe(DEPLOYMENTS);

    act(() => {
      source.emit(
        'slot_update',
        slotUpdate(snapshotSequence, {
          status: 'completed',
          content: 'duplicado no debe ganar',
          completedAt: eventTime,
        })
      );
      source.emit('slot_update', {
        conversationId,
        turnId,
        eventSequence: snapshotSequence - 1,
        response: modelResponse('base-2', {
          status: 'completed',
          content: 'evento antiguo no debe ganar',
          completedAt: eventTime,
          updatedAt: '2026-07-26T20:00:02.000Z',
        }),
      });
    });

    cached = queryClient.getQueryData<TurnEventSnapshot>(
      conversationKeys.turn(conversationId, turnId)
    )!;
    expect(cached.turn.responses[0].content).toBe('snapshot OpenAI');
    expect(cached.turn.responses[1].content).toBe('snapshot Google');

    act(() => {
      source.emit(
        'slot_update',
        slotUpdate(snapshotSequence + 1, {
          status: 'completed',
          content: 'actualización live nueva',
          completedAt: eventTime,
        })
      );
    });
    cached = queryClient.getQueryData<TurnEventSnapshot>(
      conversationKeys.turn(conversationId, turnId)
    )!;
    expect(cached.lastEventSequence).toBe(snapshotSequence + 1);
    expect(cached.turn.responses[0].content).toBe('actualización live nueva');

    view.unmount();
    expect(source.listenerCount()).toBe(0);
    queryClient.clear();
  });

  it('converges once when terminal and idle events duplicate the canonical cache', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const queryClient = createTestQueryClient();
    const initial = snapshotFixture({
      turn: turnFixture({ status: 'running' }),
      hasWorkInProgress: true,
      lastEventSequence: 19,
    });
    queryClient.setQueryData(conversationKeys.turn(conversationId, turnId), initial);
    queryClient.setQueryData(conversationKeys.detail(conversationId), {
      id: conversationId,
      title: 'Comparación',
      deployments: DEPLOYMENTS,
      hasWorkInProgress: true,
      createdAt: eventTime,
      updatedAt: eventTime,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const view = render(
      <QueryClientProvider client={queryClient}>
        <TurnEventsProbe />
      </QueryClientProvider>
    );
    expect(ControlledEventSource.instances).toHaveLength(1);
    const source = ControlledEventSource.instances[0]!;

    act(() => {
      queryClient.setQueryData(conversationKeys.turn(conversationId, turnId), {
        ...initial,
        turn: { ...initial.turn, status: 'completed' },
        hasWorkInProgress: false,
        lastEventSequence: 20,
      });
      source.emit('turn_update', {
        conversationId,
        turnId,
        eventSequence: 20,
        turn: { id: turnId, status: 'completed', updatedAt: initial.turn.updatedAt },
      });
      source.emit('busy_update', {
        conversationId,
        turnId,
        eventSequence: 20,
        hasWorkInProgress: false,
        updatedAt: initial.updatedAt,
      });
    });

    expect(source.closeCalls).toBe(1);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationKeys.detail(conversationId) });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: conversationKeys.turn(conversationId, turnId),
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(ControlledEventSource.instances).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    view.unmount();
    expect(source.closeCalls).toBe(1);
    expect(source.listenerCount()).toBe(0);
    expect(source.onerror).toBeNull();
    queryClient.clear();
  });

  it('shows an SSE error without starting polling or another transport', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(conversationKeys.turn(conversationId, turnId), snapshotFixture());

    const view = render(
      <QueryClientProvider client={queryClient}>
        <TurnEventsProbe />
      </QueryClientProvider>
    );
    const source = ControlledEventSource.instances[0]!;

    act(() => source.fail());

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo actualizar en tiempo real');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ControlledEventSource.instances).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    view.unmount();
    expect(source.closeCalls).toBe(1);
    expect(source.listenerCount()).toBe(0);
    expect(source.onerror).toBeNull();
    queryClient.clear();
  });
});
