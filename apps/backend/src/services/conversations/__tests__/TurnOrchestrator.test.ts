import { describe, expect, it, vi } from 'vitest';

import type {
  ConversationDeploymentSnapshotTuple,
  ProviderId,
  ResponseSlot,
} from '../../../types/conversations.js';
import type { LlmProvider, LlmResult, LlmRequest } from '../../../types/llm.js';
import { TurnOrchestrator } from '../TurnOrchestrator.js';

describe('TurnOrchestrator', () => {
  it('runs the three canonical bases concurrently, dispatches by providerId once, then consolidates', async () => {
    const pending = {
      'base-1': deferred<LlmResult>(),
      'base-2': deferred<LlmResult>(),
      'base-3': deferred<LlmResult>(),
    };
    const generate = {
      openrouter: vi.fn<LlmProvider['generate']>(() => pending['base-1'].promise),
      qwen: vi.fn<LlmProvider['generate']>(() => pending['base-2'].promise),
      openai: vi.fn<LlmProvider['generate']>(() => pending['base-3'].promise),
      google: vi.fn<LlmProvider['generate']>(async request =>
        resultFor(request, 'Consolidated answer')),
    };
    const providerRegistry = {
      openrouter: provider('openrouter', generate.openrouter),
      qwen: provider('qwen', generate.qwen),
      openai: provider('openai', generate.openai),
      google: provider('google', generate.google),
    };
    const turnRepository = {
      persistResponseAttempt: vi.fn(async () => undefined),
      recalculateTurn: vi.fn(async () => undefined),
    };
    const deployments = deploymentSnapshots();
    const orchestrator = new TurnOrchestrator({
      providerRegistry,
      turnRepository,
      publisher: { publish: vi.fn() },
    });

    const execution = orchestrator.executeTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'Compare this',
      deployments,
      signal: new AbortController().signal,
    });

    await vi.waitFor(() => {
      expect(generate.openrouter).toHaveBeenCalledOnce();
      expect(generate.qwen).toHaveBeenCalledOnce();
      expect(generate.openai).toHaveBeenCalledOnce();
    });
    expect(generate.google).not.toHaveBeenCalled();

    pending['base-1'].resolve(resultFor(generate.openrouter.mock.calls[0]![0], 'Base one'));
    pending['base-2'].resolve(resultFor(generate.qwen.mock.calls[0]![0], 'Base two'));
    pending['base-3'].resolve(resultFor(generate.openai.mock.calls[0]![0], 'Base three'));
    await execution;

    expect(generate.google).toHaveBeenCalledOnce();
    const requests = [
      generate.openrouter.mock.calls[0]![0],
      generate.qwen.mock.calls[0]![0],
      generate.openai.mock.calls[0]![0],
      generate.google.mock.calls[0]![0],
    ];
    expect(requests.map(({ slot, deployment }) => [slot, deployment.providerId])).toEqual([
      ['base-1', 'openrouter'],
      ['base-2', 'qwen'],
      ['base-3', 'openai'],
      ['consolidator', 'google'],
    ]);
    expect(requests[3]?.messages.map(({ content }) => content)).toEqual([
      'Consolidate the available model answers into one final answer.',
      'base-1:\nBase one',
      'base-2:\nBase two',
      'base-3:\nBase three',
      'Compare this',
    ]);
    expect(turnRepository.persistResponseAttempt).toHaveBeenCalledTimes(4);
    for (const slot of ['base-1', 'base-2', 'base-3', 'consolidator'] as const) {
      expect(turnRepository.persistResponseAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ slot, attemptNo: 1, status: 'completed' }),
      );
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function provider(
  providerId: ProviderId,
  generate: LlmProvider['generate'],
): LlmProvider {
  return {
    providerId,
    measureInputTokens: vi.fn(async () => 1),
    generate,
  };
}

function resultFor(request: LlmRequest, content: string): LlmResult {
  return {
    content,
    provider: request.deployment.providerId,
    model: request.deployment.modelId,
    startedAt: '2026-08-20T10:00:00.000Z',
    completedAt: '2026-08-20T10:00:01.000Z',
  };
}

function deploymentSnapshots(): ConversationDeploymentSnapshotTuple {
  const snapshot = <Slot extends ResponseSlot>(
    slot: Slot,
    providerId: ProviderId,
  ) => ({
    slot,
    deploymentId: `${slot}-deployment`,
    providerId,
    modelId: `${slot}-model`,
    displayName: `${slot} display`,
    contextLimitTokens: 10_000,
    maxOutputTokens: 1_000,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
  });
  return [
    snapshot('base-1', 'openrouter'),
    snapshot('base-2', 'qwen'),
    snapshot('base-3', 'openai'),
    snapshot('consolidator', 'google'),
  ];
}
