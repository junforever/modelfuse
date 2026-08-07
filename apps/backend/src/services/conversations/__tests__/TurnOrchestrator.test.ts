import { describe, expect, it, vi } from 'vitest';

import type { LlmProvider, LlmResult } from '../../../types/llm.js';
import type { ResponseSlot } from '../../../types/conversations.js';
import { TurnOrchestrator } from '../TurnOrchestrator.js';

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
});
