import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderRegistry } from '../../../infrastructure/llm/providerRegistry.js';
import type {
  PersistResponseAttemptInput,
  StoredTurnSnapshot,
} from '../../../infrastructure/postgres/repositories/turnRepository.js';
import type {
  ConversationDeploymentSnapshot,
  ConversationDeploymentSnapshotTuple,
  ModelResponse,
  ProviderId,
  ResponseSlot,
  TurnResponses,
} from '../../../types/conversations.js';
import type { LlmResult } from '../../../types/llm.js';
import type { ContextBuilder } from '../ContextBuilder.js';
import { TurnOrchestrator } from '../TurnOrchestrator.js';
import type { UnsequencedTurnEvent } from '../turnEventPublisher.js';

const axiosMock = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('axios', () => ({
  default: {
    request: axiosMock.request,
    isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
  },
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
}));

const PROVIDER_IDS = ['openai', 'google', 'minimax', 'qwen', 'openrouter'] as const;
const FIXED_TIME = '2026-08-22T12:00:00.000Z';
const UPSTREAM_ONLY_VALUE = 'credits-and-billing-must-not-cross-the-adapter-boundary';

interface TransportRequest {
  readonly url: string;
  readonly data: Record<string, unknown>;
}

interface TransportEvent {
  readonly kind: 'request' | 'response';
  readonly modelId: string;
}

describe('mixed provider deployment execution integration', () => {
  beforeEach(() => {
    axiosMock.request.mockReset();
  });

  it('dispatches persisted mixed deployments through every real adapter, waits for bases, and exposes only normalized results', async () => {
    const firstDeployments = deploymentTuple('first', [
      'openrouter',
      'qwen',
      'openai',
      'google',
    ]);
    const secondDeployments = deploymentTuple('second', [
      'minimax',
      'openrouter',
      'google',
      'qwen',
    ]);
    const deploymentsByModel = new Map(
      [...firstDeployments, ...secondDeployments].map(deployment => [
        deployment.modelId,
        deployment,
      ])
    );
    const firstBaseGate = baseGate(firstDeployments);
    const secondBaseGate = baseGate(secondDeployments);
    const transportEvents: TransportEvent[] = [];
    const transportCalls: Array<{
      request: TransportRequest;
      deployment: ConversationDeploymentSnapshot;
    }> = [];

    axiosMock.request.mockImplementation(async (request: TransportRequest) => {
      const modelId = modelIdFrom(request);
      const deployment = deploymentsByModel.get(modelId);
      if (!deployment) throw new Error(`Unexpected integration transport model: ${modelId}`);

      transportCalls.push({ request, deployment });
      transportEvents.push({ kind: 'request', modelId });
      const gate = [firstBaseGate, secondBaseGate].find(candidate =>
        candidate.models.has(modelId)
      );
      if (gate) {
        gate.requested.add(modelId);
        if (gate.requested.size === gate.models.size) gate.allRequested.resolve();
        await gate.release.promise;
      }
      transportEvents.push({ kind: 'response', modelId });
      return { data: upstreamResponse(deployment) };
    });

    const providerRegistry = createProviderRegistry({
      OPENAI_API_KEY: 'integration-openai-key',
      OPENAI_BASE_URL: 'https://openai.integration.invalid/chat/completions',
      GOOGLE_API_KEY: 'integration-google-key',
      GOOGLE_BASE_URL: 'https://google.integration.invalid',
      MINIMAX_API_KEY: 'integration-minimax-key',
      MINIMAX_BASE_URL: 'https://minimax.integration.invalid/chat/completions',
      QWEN_API_KEY: 'integration-qwen-key',
      QWEN_BASE_URL: 'https://qwen.integration.invalid/generation',
      OPENROUTER_API_KEY: 'integration-openrouter-key',
      LLM_PROVIDER_TIMEOUT_MS: 1_000,
    });
    expect(Object.keys(providerRegistry).sort()).toEqual([...PROVIDER_IDS].sort());

    const providerSpies = PROVIDER_IDS.map(providerId => {
      const provider = providerRegistry[providerId];
      if (!provider) throw new Error(`Provider registry omitted ${providerId}`);
      return { providerId, spy: vi.spyOn(provider, 'generate') };
    });
    const repository = new InMemoryTurnRepository([
      storedSnapshot('conversation-first', 'turn-first', firstDeployments),
      storedSnapshot('conversation-second', 'turn-second', secondDeployments),
    ]);
    const contextBuilder: Pick<ContextBuilder, 'build'> = {
      build: vi.fn(async input => ({
        ok: true as const,
        messages: [
          { role: 'user' as const, content: input.prompt },
          ...(input.currentBaseResponses ?? []).map(({ slot, content }) => ({
            role: 'user' as const,
            content: `${slot}:\n${content ?? '[unavailable]'}`,
          })),
        ],
        contextWindow: {
          truncated: false,
          firstIncludedOrdinal: input.currentOrdinal,
          lastIncludedOrdinal: input.currentOrdinal,
          protectionApplied: 'none' as const,
        },
      })),
    };
    const published: UnsequencedTurnEvent[] = [];
    const orchestrator = new TurnOrchestrator({
      providerRegistry,
      turnRepository: repository,
      publisher: { publish: event => published.push(event) },
      contextBuilder,
    });

    const firstExecution = orchestrator.executeTurn({
      conversationId: 'conversation-first',
      turnId: 'turn-first',
      prompt: 'Compare the first mixed-provider answers.',
      deployments: firstDeployments,
      signal: new AbortController().signal,
    });

    await firstBaseGate.allRequested.promise;
    expect(callsForModel(transportCalls, firstDeployments[3].modelId)).toHaveLength(0);
    firstBaseGate.release.resolve();
    await firstExecution;

    const secondExecution = orchestrator.executeTurn({
      conversationId: 'conversation-second',
      turnId: 'turn-second',
      prompt: 'Compare the second mixed-provider answers.',
      deployments: secondDeployments,
      signal: new AbortController().signal,
    });

    await secondBaseGate.allRequested.promise;
    expect(callsForModel(transportCalls, secondDeployments[3].modelId)).toHaveLength(0);
    secondBaseGate.release.resolve();
    await secondExecution;

    expect(axiosMock.request).toHaveBeenCalledTimes(8);
    for (const deployment of [...firstDeployments, ...secondDeployments]) {
      const [call] = callsForModel(transportCalls, deployment.modelId);
      expect(call, deployment.modelId).toBeDefined();
      expect(callsForModel(transportCalls, deployment.modelId)).toHaveLength(1);
      expect(providerIdFromUrl(call!.request.url)).toBe(deployment.providerId);
    }
    assertBasesCompleteBeforeConsolidator(transportEvents, firstDeployments);
    assertBasesCompleteBeforeConsolidator(transportEvents, secondDeployments);
    assertConsolidatorReceivedBases(transportCalls, firstDeployments);
    assertConsolidatorReceivedBases(transportCalls, secondDeployments);

    const normalizedResults: LlmResult[] = [];
    for (const { providerId, spy } of providerSpies) {
      const expectedDeployments = [...firstDeployments, ...secondDeployments].filter(
        deployment => deployment.providerId === providerId
      );
      expect(spy).toHaveBeenCalledTimes(expectedDeployments.length);
      for (const [request] of spy.mock.calls) {
        expect(request.deployment.providerId).toBe(providerId);
        expect(request.slot).toBe(request.deployment.slot);
        expect(request.deployment).toEqual(deploymentsByModel.get(request.deployment.modelId));
      }
      for (const result of spy.mock.results) {
        normalizedResults.push(await result.value);
      }
    }

    for (const result of normalizedResults) {
      expect(Object.keys(result).sort()).toEqual([
        'completedAt',
        'content',
        'metrics',
        'model',
        'provider',
        'startedAt',
      ]);
      expect(result.metrics).toEqual({ inputTokens: 11, outputTokens: 7, totalTokens: 18 });
      expect(Object.keys(result.metrics ?? {}).sort()).toEqual([
        'inputTokens',
        'outputTokens',
        'totalTokens',
      ]);
    }

    expect(repository.persistedAttempts).toHaveLength(8);
    expect(
      repository.persistedAttempts.map(({ turnId, slot }) => `${turnId}:${slot}`).sort()
    ).toEqual([
      'turn-first:base-1',
      'turn-first:base-2',
      'turn-first:base-3',
      'turn-first:consolidator',
      'turn-second:base-1',
      'turn-second:base-2',
      'turn-second:base-3',
      'turn-second:consolidator',
    ]);
    assertStoredAttribution(repository.getSnapshot('turn-first'), firstDeployments);
    assertStoredAttribution(repository.getSnapshot('turn-second'), secondDeployments);

    const observableOutput = JSON.stringify({
      normalizedResults,
      snapshots: [repository.getSnapshot('turn-first'), repository.getSnapshot('turn-second')],
      published,
    });
    expect(observableOutput).not.toContain(UPSTREAM_ONLY_VALUE);
    expect(observableOutput).not.toMatch(/cost|price|billing|credits|currency/i);
  });
});

class InMemoryTurnRepository {
  readonly persistedAttempts: PersistResponseAttemptInput[] = [];
  private readonly snapshots: Map<string, StoredTurnSnapshot>;

  constructor(snapshots: StoredTurnSnapshot[]) {
    this.snapshots = new Map(snapshots.map(snapshot => [snapshot.turn.id, snapshot]));
  }

  async persistResponseAttempt(
    input: PersistResponseAttemptInput
  ): Promise<StoredTurnSnapshot | null> {
    this.persistedAttempts.push(input);
    const snapshot = this.snapshots.get(input.turnId);
    if (!snapshot) return null;
    const response = snapshot.turn.responses.find(candidate => candidate.slot === input.slot);
    if (!response) return null;

    response.status = input.status;
    response.content = input.content ?? null;
    response.error = input.errorCode
      ? { code: input.errorCode, message: input.errorMessage ?? 'Provider request failed.' }
      : null;
    response.recoverable = input.errorRecoverable === true;
    response.attemptNo = input.attemptNo;
    response.metadata = (input.metadata ?? null) as ModelResponse['metadata'];
    response.startedAt = input.startedAt;
    response.completedAt = input.completedAt;
    response.updatedAt = input.completedAt;
    snapshot.turn.status = snapshot.turn.responses.every(candidate => candidate.status === 'completed')
      ? 'completed'
      : 'running';
    snapshot.turn.updatedAt = input.completedAt;
    snapshot.conversation.updatedAt = input.completedAt;
    snapshot.conversation.hasWorkInProgress = snapshot.turn.status !== 'completed';
    return snapshot;
  }

  getSnapshot(turnId: string): StoredTurnSnapshot {
    const snapshot = this.snapshots.get(turnId);
    if (!snapshot) throw new Error(`Missing integration snapshot for ${turnId}`);
    return snapshot;
  }
}

function deploymentTuple(
  prefix: string,
  providerIds: readonly [ProviderId, ProviderId, ProviderId, ProviderId]
): ConversationDeploymentSnapshotTuple {
  return [
    deployment(prefix, 'base-1', providerIds[0]),
    deployment(prefix, 'base-2', providerIds[1]),
    deployment(prefix, 'base-3', providerIds[2]),
    deployment(prefix, 'consolidator', providerIds[3]),
  ];
}

function deployment<Slot extends ResponseSlot>(
  prefix: string,
  slot: Slot,
  providerId: ProviderId
): ConversationDeploymentSnapshot<Slot> {
  return {
    slot,
    deploymentId: `${prefix}-${slot}-${providerId}-deployment`,
    providerId,
    modelId: `${prefix}/${slot}/${providerId}-model`,
    displayName: `${prefix} ${slot} ${providerId}`,
    contextLimitTokens: 1_000_000,
    maxOutputTokens: 12_345,
    inputModalities: ['text'],
    outputModalities: ['text'],
  };
}

function storedSnapshot(
  conversationId: string,
  turnId: string,
  deployments: ConversationDeploymentSnapshotTuple
): StoredTurnSnapshot {
  return {
    conversation: {
      id: conversationId,
      title: `Integration ${conversationId}`,
      hasWorkInProgress: true,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    },
    deployments,
    turn: {
      id: turnId,
      clientRequestId: `request-${turnId}`,
      ordinal: 1,
      prompt: `Prompt for ${turnId}`,
      status: 'running',
      responses: [
        responseFor(deployments[0]),
        responseFor(deployments[1]),
        responseFor(deployments[2]),
        responseFor(deployments[3]),
      ] as TurnResponses,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    },
  };
}

function responseFor<Slot extends ResponseSlot>(
  deployment: ConversationDeploymentSnapshot<Slot>
): ModelResponse<Slot> {
  return {
    slot: deployment.slot,
    role: (deployment.slot === 'consolidator'
      ? 'consolidator'
      : 'base') as ModelResponse<Slot>['role'],
    provider: deployment.providerId,
    model: deployment.modelId,
    status: 'pending',
    content: null,
    error: null,
    recoverable: false,
    continuedWithout: false,
    isStale: false,
    attemptNo: 1,
    metadata: null,
    startedAt: null,
    completedAt: null,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  };
}

function baseGate(deployments: ConversationDeploymentSnapshotTuple) {
  return {
    models: new Set(deployments.slice(0, 3).map(({ modelId }) => modelId)),
    requested: new Set<string>(),
    allRequested: deferred(),
    release: deferred(),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function modelIdFrom(request: TransportRequest): string {
  const model = request.data.model;
  if (typeof model === 'string') return model;
  const match = request.url.match(/\/models\/(.+):generateContent$/);
  if (!match?.[1]) throw new Error(`Cannot identify model for ${request.url}`);
  return decodeURIComponent(match[1]);
}

function providerIdFromUrl(url: string): ProviderId {
  if (url.startsWith('https://openai.integration.invalid/')) return 'openai';
  if (url.startsWith('https://google.integration.invalid/')) return 'google';
  if (url.startsWith('https://minimax.integration.invalid/')) return 'minimax';
  if (url.startsWith('https://qwen.integration.invalid/')) return 'qwen';
  if (url === 'https://openrouter.ai/api/v1/chat/completions') return 'openrouter';
  throw new Error(`Unexpected provider transport URL: ${url}`);
}

function upstreamResponse(deployment: ConversationDeploymentSnapshot): Record<string, unknown> {
  const content = `${deployment.modelId} normalized answer`;
  const upstreamOnly = {
    cost: 99,
    credits: UPSTREAM_ONLY_VALUE,
    billing: { currency: 'never-expose' },
  };
  switch (deployment.providerId) {
    case 'google':
      return {
        candidates: [{ content: { parts: [{ text: content }] } }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
        ...upstreamOnly,
      };
    case 'qwen':
      return {
        output: { choices: [{ message: { content } }] },
        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
        ...upstreamOnly,
      };
    default:
      return {
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        ...upstreamOnly,
      };
  }
}

function callsForModel(
  calls: Array<{ request: TransportRequest; deployment: ConversationDeploymentSnapshot }>,
  modelId: string
) {
  return calls.filter(({ deployment }) => deployment.modelId === modelId);
}

function assertBasesCompleteBeforeConsolidator(
  events: TransportEvent[],
  deployments: ConversationDeploymentSnapshotTuple
): void {
  const consolidatorRequest = events.findIndex(
    event => event.kind === 'request' && event.modelId === deployments[3].modelId
  );
  const baseResponses = deployments.slice(0, 3).map(deployment =>
    events.findIndex(
      event => event.kind === 'response' && event.modelId === deployment.modelId
    )
  );
  expect(baseResponses.every(index => index >= 0)).toBe(true);
  expect(consolidatorRequest).toBeGreaterThan(Math.max(...baseResponses));
}

function assertConsolidatorReceivedBases(
  calls: Array<{ request: TransportRequest; deployment: ConversationDeploymentSnapshot }>,
  deployments: ConversationDeploymentSnapshotTuple
): void {
  const [consolidatorCall] = callsForModel(calls, deployments[3].modelId);
  const payload = JSON.stringify(consolidatorCall!.request.data);
  for (const base of deployments.slice(0, 3)) {
    expect(payload).toContain(`${base.modelId} normalized answer`);
  }
}

function assertStoredAttribution(
  snapshot: StoredTurnSnapshot,
  expected: ConversationDeploymentSnapshotTuple
): void {
  expect(
    snapshot.deployments.map(({ slot, deploymentId, providerId, modelId }) => ({
      slot,
      deploymentId,
      providerId,
      modelId,
    }))
  ).toEqual(
    expected.map(({ slot, deploymentId, providerId, modelId }) => ({
      slot,
      deploymentId,
      providerId,
      modelId,
    }))
  );
  expect(
    snapshot.turn.responses.map(({ slot, provider, model, status, content }) => ({
      slot,
      provider,
      model,
      status,
      content,
    }))
  ).toEqual(
    expected.map(deployment => ({
      slot: deployment.slot,
      provider: deployment.providerId,
      model: deployment.modelId,
      status: 'completed',
      content: `${deployment.modelId} normalized answer`,
    }))
  );
}
