import { describe, expect, it, vi } from 'vitest';

import type {
  ConversationDeploymentSnapshotTuple,
  ProviderId,
  ResponseSlot,
} from '../../../types/conversations.js';
import type { LlmProvider, LlmResult, LlmRequest } from '../../../types/llm.js';
import type { ContextBuilder } from '../ContextBuilder.js';
import { TurnOrchestrator } from '../TurnOrchestrator.js';

type CurrentBaseResponse = NonNullable<
  Parameters<ContextBuilder['build']>[0]['currentBaseResponses']
>[number];

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
        resultFor(request, 'Consolidated answer')
      ),
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
      contextBuilder: {
        build: vi.fn<ContextBuilder['build']>(async input => ({
          ok: true as const,
          messages: [
            {
              role: 'system' as const,
              content:
                input.deployment.slot === 'consolidator'
                  ? 'Consolidate the available model answers into one final answer.'
                  : 'Provide a complete, accurate answer to the user prompt.',
            },
            ...(input.currentBaseResponses ?? []).map(({ slot, content }: CurrentBaseResponse) => ({
              role: 'user' as const,
              content: `${slot}:\n${content ?? '[unavailable]'}`,
            })),
            { role: 'user' as const, content: input.prompt },
          ],
          contextWindow: {
            truncated: false,
            firstIncludedOrdinal: input.currentOrdinal,
            lastIncludedOrdinal: input.currentOrdinal,
            protectionApplied: 'none',
          },
        })),
      },
    });

    const execution = executeTurnWithWebSearch(orchestrator, {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'Compare this',
      webSearchEnabled: false,
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
        expect.objectContaining({ slot, attemptNo: 1, status: 'completed' })
      );
    }
  });

  it('requests web search only for capable deployments while all slots continue normally', async () => {
    const generate = vi.fn<LlmProvider['generate']>(async request => ({
      ...resultFor(request, `${request.slot} answer`),
      ...(request.slot === 'base-1'
        ? { citations: [{ url: 'https://example.com/source', title: 'Current source' }] }
        : {}),
    }));
    const persistResponseAttempt = vi.fn(async () => undefined);
    const orchestrator = new TurnOrchestrator({
      providerRegistry: {
        openrouter: provider('openrouter', generate),
        qwen: provider('qwen', generate),
        openai: provider('openai', generate),
        google: provider('google', generate),
      },
      turnRepository: {
        persistResponseAttempt,
        recalculateTurn: vi.fn(async () => undefined),
      },
      publisher: { publish: vi.fn() },
      contextBuilder: {
        build: vi.fn<ContextBuilder['build']>(async input => ({
          ok: true as const,
          messages: [{ role: 'user' as const, content: input.prompt }],
          contextWindow: {
            truncated: false,
            firstIncludedOrdinal: input.currentOrdinal,
            lastIncludedOrdinal: input.currentOrdinal,
            protectionApplied: 'none',
          },
        })),
      },
    });
    const deployments = deploymentSnapshots();

    await executeTurnWithWebSearch(orchestrator, {
      conversationId: 'conversation-1',
      turnId: 'turn-with-search',
      prompt: 'Use current sources',
      webSearchEnabled: true,
      deployments,
      signal: new AbortController().signal,
    });

    expect(generate).toHaveBeenCalledTimes(4);
    expect(
      generate.mock.calls.map(([request]) => [request.slot, requestedWebSearch(request)])
    ).toEqual([
      ['base-1', true],
      ['base-2', false],
      ['base-3', false],
      ['consolidator', true],
    ]);
    expect(persistResponseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        slot: 'base-1',
        metadata: expect.objectContaining({
          citations: [{ url: 'https://example.com/source', title: 'Current source' }],
        }),
      })
    );

    generate.mockClear();
    await executeTurnWithWebSearch(orchestrator, {
      conversationId: 'conversation-1',
      turnId: 'turn-without-search',
      prompt: 'Use only model knowledge',
      webSearchEnabled: false,
      deployments,
      signal: new AbortController().signal,
    });

    expect(generate).toHaveBeenCalledTimes(4);
    expect(generate.mock.calls.map(([request]) => requestedWebSearch(request))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function provider(providerId: ProviderId, generate: LlmProvider['generate']): LlmProvider {
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

type WebSearchExecutionInput = Parameters<TurnOrchestrator['executeTurn']>[0] & {
  readonly webSearchEnabled: boolean;
};

function executeTurnWithWebSearch(
  orchestrator: TurnOrchestrator,
  input: WebSearchExecutionInput
): Promise<void> {
  const execute = orchestrator.executeTurn as (input: WebSearchExecutionInput) => Promise<void>;
  return execute.call(orchestrator, input);
}

function requestedWebSearch(request: LlmRequest): unknown {
  return (request as LlmRequest & { readonly webSearchEnabled?: unknown }).webSearchEnabled;
}

function deploymentSnapshots(): ConversationDeploymentSnapshotTuple {
  const snapshot = <Slot extends ResponseSlot>(slot: Slot, providerId: ProviderId) => ({
    slot,
    deploymentId: `${slot}-deployment`,
    providerId,
    modelId: `${slot}-model`,
    displayName: `${slot} display`,
    supportsWebSearch: slot === 'base-1' || slot === 'consolidator',
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
