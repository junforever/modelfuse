import { describe, expect, it, vi } from 'vitest';

import type { LlmProvider, LlmResult } from '../../../types/llm.js';
import type { ModelResponse, ResponseSlot, ResponseStatus } from '../../../types/conversations.js';
import type { StoredTurnSnapshot } from '../../../infrastructure/postgres/repositories/turnRepository.js';
import { TurnOrchestrator } from '../TurnOrchestrator.js';
import type { UnsequencedTurnEvent } from '../turnEventPublisher.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const resultFor = (slot: ResponseSlot, content: string): LlmResult => ({
  content,
  provider: `${slot}-provider`,
  model: `${slot}-model`,
  startedAt: '2026-08-07T10:00:00.000Z',
  completedAt: '2026-08-07T10:00:01.000Z',
});

describe('TurnOrchestrator', () => {
  it('starts all bases in parallel, persists attempt one, and consolidates only available results', async () => {
    const pending = {
      openai: deferred<LlmResult>(),
      google: deferred<LlmResult>(),
      minimax: deferred<LlmResult>(),
    };
    const generate = {
      openai: vi.fn<LlmProvider['generate']>(() => pending.openai.promise),
      google: vi.fn<LlmProvider['generate']>(() => pending.google.promise),
      minimax: vi.fn<LlmProvider['generate']>(() => pending.minimax.promise),
      qwen: vi.fn<LlmProvider['generate']>(async () =>
        resultFor('qwen', 'Consolidated answer'),
      ),
    };
    const provider = (slot: ResponseSlot): LlmProvider => ({
      slot,
      provider: `${slot}-provider`,
      model: `${slot}-model`,
      context: {
        limitTokens: 10_000,
        measureInputTokens: () => ({ kind: 'exact', tokens: 1 }),
      },
      generate: generate[slot],
    });
    const providerRegistry = {
      openai: provider('openai'),
      google: provider('google'),
      minimax: provider('minimax'),
      qwen: provider('qwen'),
    };
    const turnRepository = {
      persistResponseAttempt: vi.fn(async () => undefined),
      recalculateTurn: vi.fn(async () => undefined),
    };
    const publisher = { publish: vi.fn() };
    const orchestrator = new TurnOrchestrator({
      providerRegistry,
      turnRepository,
      publisher,
    });

    const execution = orchestrator.executeTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'Compare this',
      signal: new AbortController().signal,
    });

    await vi.waitFor(() => {
      expect(generate.openai).toHaveBeenCalledOnce();
      expect(generate.google).toHaveBeenCalledOnce();
      expect(generate.minimax).toHaveBeenCalledOnce();
    });
    expect(generate.qwen).not.toHaveBeenCalled();

    pending.openai.resolve(resultFor('openai', 'OpenAI available'));
    pending.google.reject({
      code: 'provider_transient_error',
      safeMessage: 'Google unavailable',
      provider: 'google-provider',
      model: 'google-model',
      recoverable: true,
    });
    pending.minimax.resolve(resultFor('minimax', 'MiniMax available'));
    await execution;

    expect(turnRepository.persistResponseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-1', slot: 'openai', attemptNo: 1, status: 'completed' }),
    );
    expect(turnRepository.persistResponseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-1', slot: 'google', attemptNo: 1, status: 'failed' }),
    );
    expect(turnRepository.persistResponseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-1', slot: 'minimax', attemptNo: 1, status: 'completed' }),
    );
    expect(turnRepository.persistResponseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-1', slot: 'qwen', attemptNo: 1, status: 'completed' }),
    );

    const qwenRequest = generate.qwen.mock.calls[0]?.[0];
    const qwenContext = qwenRequest?.messages.map(({ content }) => content).join('\n');
    expect(qwenContext).toContain('OpenAI available');
    expect(qwenContext).toContain('MiniMax available');
    expect(qwenContext).not.toContain('Google unavailable');
  });

  it('persists running and terminal states before publishing them, including provider failure during consolidation', async () => {
    const trace: string[] = [];
    const persisted = new Map<ResponseSlot, ResponseStatus>([
      ['openai', 'pending'],
      ['google', 'pending'],
      ['minimax', 'pending'],
      ['qwen', 'pending'],
    ]);
    const generate = {
      openai: vi.fn<LlmProvider['generate']>(async () => resultFor('openai', 'OpenAI answer')),
      google: vi.fn<LlmProvider['generate']>(async () => {
        throw {
          code: 'timeout',
          safeMessage: 'Google timed out',
        };
      }),
      minimax: vi.fn<LlmProvider['generate']>(async () => resultFor('minimax', 'MiniMax answer')),
      qwen: vi.fn<LlmProvider['generate']>(async () => {
        throw {
          code: 'provider_transient_error',
          safeMessage: 'Qwen unavailable',
        };
      }),
    };
    const provider = (slot: ResponseSlot): LlmProvider => ({
      slot,
      provider: `${slot}-provider`,
      model: `${slot}-model`,
      context: {
        limitTokens: 10_000,
        measureInputTokens: () => ({ kind: 'exact', tokens: 1 }),
      },
      generate: generate[slot],
    });
    const providerRegistry = {
      openai: provider('openai'),
      google: provider('google'),
      minimax: provider('minimax'),
      qwen: provider('qwen'),
    };
    const turnRepository = {
      startResponseAttempt: vi.fn(async ({ slot }: { slot: ResponseSlot }) => {
        persisted.set(slot, 'running');
        trace.push(`persist:${slot}:running`);
        return { attemptNo: 1, snapshot: snapshotFor(slot, 'running') };
      }),
      persistResponseAttempt: vi.fn(async (input: { slot: ResponseSlot; status: 'completed' | 'failed' }) => {
        persisted.set(input.slot, input.status);
        trace.push(`persist:${input.slot}:${input.status}`);
        return snapshotFor(input.slot, input.status);
      }),
    };
    const publisher = {
      publish: vi.fn((event: UnsequencedTurnEvent) => {
        if (event.event === 'slot_update') {
          const { slot, status } = event.data.response;
          expect(persisted.get(slot)).toBe(status);
          trace.push(`publish:${slot}:${status}`);
        } else {
          trace.push(`publish:${event.event}`);
        }
      }),
    };
    const orchestrator = new TurnOrchestrator({ providerRegistry, turnRepository, publisher });

    await orchestrator.executeTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'Compare this',
      signal: new AbortController().signal,
    });

    expect(trace.indexOf('persist:openai:completed')).toBeLessThan(trace.indexOf('publish:openai:completed'));
    expect(trace.indexOf('persist:google:failed')).toBeLessThan(trace.indexOf('publish:google:failed'));
    expect(trace.indexOf('persist:minimax:completed')).toBeLessThan(trace.indexOf('publish:minimax:completed'));
    expect(trace.indexOf('persist:qwen:failed')).toBeLessThan(trace.indexOf('publish:qwen:failed'));
    expect(generate.qwen).toHaveBeenCalledOnce();
    expect(turnRepository.persistResponseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ slot: 'qwen', status: 'failed', errorCode: 'provider_transient_error' }),
    );
  });
});

function snapshotFor(slot: ResponseSlot, status: 'running' | 'completed' | 'failed'): StoredTurnSnapshot {
  const responseFor = <Slot extends ResponseSlot>(responseSlot: Slot): ModelResponse<Slot> => ({
    slot: responseSlot,
    role: (responseSlot === 'qwen' ? 'consolidator' : 'base') as ModelResponse<Slot>['role'],
    provider: `${responseSlot}-provider`,
    model: `${responseSlot}-model`,
    status,
    content: status === 'completed' ? `${responseSlot} answer` : null,
    error: status === 'failed' ? { code: 'provider_error', message: 'provider failed' } : null,
    recoverable: status === 'failed',
    continuedWithout: false,
    isStale: false,
    attemptNo: 1,
    metadata: null,
    startedAt: '2026-08-07T10:00:00.000Z',
    completedAt: status === 'running' ? null : '2026-08-07T10:00:01.000Z',
    createdAt: '2026-08-07T10:00:00.000Z',
    updatedAt: '2026-08-07T10:00:01.000Z',
  });

  return {
    conversation: {
      id: 'conversation-1',
      title: 'Test',
      hasWorkInProgress: status === 'running',
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:00:01.000Z',
    },
    turn: {
      id: 'turn-1',
      clientRequestId: 'request-1',
      ordinal: 1,
      prompt: 'Compare this',
      status: status === 'failed' ? 'failed' : status === 'completed' ? 'completed' : 'running',
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:00:01.000Z',
      responses: [
        responseFor('openai'),
        responseFor('google'),
        responseFor('minimax'),
        responseFor('qwen'),
      ],
    },
  };
}
