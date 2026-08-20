import { describe, expect, it, vi } from 'vitest';

import type { ConversationRepository } from '../../../infrastructure/postgres/repositories/conversationRepository.js';
import type {
  ConversationDeploymentSnapshotTuple,
  DeploymentAssignment,
} from '../../../types/conversations.js';
import type {
  StoredTurnSnapshot,
  TurnRepository,
} from '../../../infrastructure/postgres/repositories/turnRepository.js';
import { createConversationFixture } from '../../../test/fixtures/conversationFixtures.js';
import type { ModelCatalogService } from '../../llm/ModelCatalogService.js';
import { ConversationService } from '../ConversationService.js';
import { DefaultProfileUnavailableError } from '../conversationErrors.js';
import type { TurnOrchestrator } from '../TurnOrchestrator.js';

const logSink = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../../../utils/logger.js', () => ({
  logger: { error: logSink.error, info: vi.fn(), warn: vi.fn() },
}));

describe('ConversationService background execution', () => {
  it('commits the complete canonical assignment and reads it back before provider work starts', async () => {
    const trace: string[] = [];
    const deployments = deploymentSnapshots();
    const committed = deferred<{
      kind: 'created';
      conversationId: string;
      turnId: string;
      deployments: ConversationDeploymentSnapshotTuple;
    }>();
    const stored = storedTurnSnapshot(deployments);
    const deploymentIds = Object.fromEntries(
      deployments.map(({ slot, deploymentId }) => [slot, deploymentId]),
    ) as unknown as DeploymentAssignment;
    const createConversation = vi.fn((input: {
      clientRequestId: string;
      prompt: string;
      title: string;
      deployments: ConversationDeploymentSnapshotTuple;
    }) => {
      trace.push('transaction');
      expect(input).toEqual({
        clientRequestId: stored.turn.clientRequestId,
        prompt: stored.turn.prompt,
        title: stored.turn.prompt,
        deployments,
      });
      return committed.promise;
    });
    const conversationRepository = {
      findCreateReplay: vi.fn(async () => null),
      createConversation,
    } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(async () => {
        trace.push('read:turn');
        return stored;
      }),
    } as unknown as TurnRepository;
    const orchestrator = {
      executeTurn: vi.fn(async () => {
        trace.push('provider-work');
      }),
    } as unknown as TurnOrchestrator;
    const modelCatalogService = {
      resolveExplicitAssignment: vi.fn(() => ({ kind: 'resolved', deployments })),
    } as unknown as ModelCatalogService;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
      modelCatalogService,
    });

    const creation = service.createConversation({
      clientRequestId: stored.turn.clientRequestId,
      prompt: `  ${stored.turn.prompt}  `,
      deploymentIds,
    });
    await vi.waitFor(() => expect(createConversation).toHaveBeenCalledOnce());
    expect(orchestrator.executeTurn).not.toHaveBeenCalled();

    committed.resolve({
      kind: 'created',
      conversationId: stored.conversation.id,
      turnId: stored.turn.id,
      deployments,
    });
    const result = await creation;
    await service.stop();

    expect(trace).toEqual(['transaction', 'read:turn', 'provider-work']);
    expect(result.conversation.deployments.map(({ slot }) => slot)).toEqual([
      'base-1',
      'base-2',
      'base-3',
      'consolidator',
    ]);
    expect(orchestrator.executeTurn).toHaveBeenCalledWith(expect.objectContaining({ deployments }));
  });

  it('uses the exact four-slot default when deploymentIds are omitted', async () => {
    const deployments = defaultDeploymentSnapshots();
    const stored = storedTurnSnapshot(deployments);
    const conversationRepository = {
      findCreateReplay: vi.fn(async () => null),
      createConversation: vi.fn(async () => ({
        kind: 'created' as const,
        conversationId: stored.conversation.id,
        turnId: stored.turn.id,
        deployments,
      })),
    } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(async () => stored),
    } as unknown as TurnRepository;
    const orchestrator = {
      executeTurn: vi.fn(async () => undefined),
    } as unknown as TurnOrchestrator;
    const modelCatalogService = {
      resolveDefaultAssignment: vi.fn(() => ({ kind: 'resolved' as const, deployments })),
    } as unknown as ModelCatalogService;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
      modelCatalogService,
    });

    const result = await service.createConversation({
      clientRequestId: stored.turn.clientRequestId,
      prompt: stored.turn.prompt,
    });
    await service.stop();

    expect(modelCatalogService.resolveDefaultAssignment).toHaveBeenCalledOnce();
    expect(conversationRepository.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ deployments }),
    );
    expect(result.conversation.deployments.map(({ slot, deploymentId }) => [slot, deploymentId]))
      .toEqual([
        ['base-1', 'openai-5.6-sol'],
        ['base-2', 'gemini-3.7-flash'],
        ['base-3', 'openrouter-minimax-m3'],
        ['consolidator', 'openrouter-qwen-3.8-max'],
      ]);
    expect(orchestrator.executeTurn).toHaveBeenCalledWith(expect.objectContaining({ deployments }));
  });

  it('uses the original stored snapshots for a later turn after the runtime catalog changes', async () => {
    const originalDeployments = deploymentSnapshots();
    const replacementDeployments = defaultDeploymentSnapshots();
    const stored = storedTurnSnapshot(originalDeployments);
    const conversationRepository = {
      createTurn: vi.fn(async () => ({
        kind: 'created' as const,
        conversationId: stored.conversation.id,
        turnId: stored.turn.id,
        deployments: originalDeployments,
      })),
    } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(async () => stored),
    } as unknown as TurnRepository;
    const orchestrator = {
      executeTurn: vi.fn(async () => undefined),
    } as unknown as TurnOrchestrator;
    const modelCatalogService = {
      resolveDefaultAssignment: vi.fn(() => ({
        kind: 'resolved' as const,
        deployments: replacementDeployments,
      })),
    } as unknown as ModelCatalogService;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
      modelCatalogService,
    });

    const result = await service.createTurn(stored.conversation.id, {
      clientRequestId: stored.turn.clientRequestId,
      prompt: stored.turn.prompt,
    });
    await service.stop();

    expect(result.conversation.deployments).toEqual(publicDeployments(originalDeployments));
    expect(orchestrator.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ deployments: originalDeployments }),
    );
    expect(modelCatalogService.resolveDefaultAssignment).not.toHaveBeenCalled();
  });

  it('returns the original assignment for an idempotent replay without consulting the current catalog or relaunching', async () => {
    const originalDeployments = deploymentSnapshots();
    const stored = storedTurnSnapshot(originalDeployments);
    const conversationRepository = {
      findCreateReplay: vi.fn(async () => ({
        kind: 'replay' as const,
        conversationId: stored.conversation.id,
        turnId: stored.turn.id,
        deployments: originalDeployments,
      })),
      createConversation: vi.fn(async () => ({
        kind: 'replay' as const,
        conversationId: stored.conversation.id,
        turnId: stored.turn.id,
        deployments: originalDeployments,
      })),
    } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(async () => stored),
    } as unknown as TurnRepository;
    const orchestrator = {
      executeTurn: vi.fn(async () => undefined),
    } as unknown as TurnOrchestrator;
    const modelCatalogService = {
      resolveDefaultAssignment: vi.fn(() => {
        throw new Error('The mutable catalog must not be consulted for a replay');
      }),
    } as unknown as ModelCatalogService;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
      modelCatalogService,
    });

    const result = await service.createConversation({
      clientRequestId: stored.turn.clientRequestId,
      prompt: stored.turn.prompt,
    });

    expect(result.conversation.deployments).toEqual(publicDeployments(originalDeployments));
    expect(modelCatalogService.resolveDefaultAssignment).not.toHaveBeenCalled();
    expect(conversationRepository.createConversation).not.toHaveBeenCalled();
    expect(orchestrator.executeTurn).not.toHaveBeenCalled();
  });

  it('projects a safe 503 and performs no writes or provider work when the default is unavailable', async () => {
    const missingDeploymentIds = [
      'openrouter-minimax-m3',
      'openrouter-qwen-3.8-max',
    ] as const;
    const conversationRepository = {
      findCreateReplay: vi.fn(async () => null),
      createConversation: vi.fn(),
    } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(),
    } as unknown as TurnRepository;
    const orchestrator = {
      executeTurn: vi.fn(),
    } as unknown as TurnOrchestrator;
    const modelCatalogService = {
      resolveDefaultAssignment: vi.fn(() => ({
        kind: 'unavailable' as const,
        missingDeploymentIds,
      })),
    } as unknown as ModelCatalogService;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
      modelCatalogService,
    });

    const error = await service.createConversation({
      clientRequestId: '423e4567-e89b-42d3-a456-426614174001',
      prompt: 'No debe persistirse',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DefaultProfileUnavailableError);
    if (!(error instanceof DefaultProfileUnavailableError)) {
      throw new Error('Expected DefaultProfileUnavailableError');
    }
    expect({
      status: error.status,
      code: error.code,
      message: error.message,
      missingDeploymentIds: error.missingDeploymentIds,
    }).toEqual({
      status: 503,
      code: 'DEFAULT_PROFILE_UNAVAILABLE',
      message: 'The default deployment profile is unavailable.',
      missingDeploymentIds,
    });
    expect(JSON.stringify(error)).not.toMatch(/API_KEY|credential|provider/i);
    expect(conversationRepository.createConversation).not.toHaveBeenCalled();
    expect(turnRepository.getTurnSnapshot).not.toHaveBeenCalled();
    expect(orchestrator.executeTurn).not.toHaveBeenCalled();
  });

  it('logs an orchestration rejection with safe identifiers and no prompt or error detail', async () => {
    const deployments = deploymentSnapshots();
    const snapshot = storedTurnSnapshot(deployments);
    snapshot.turn.prompt = 'prompt-canary-must-not-leak';
    const conversationRepository = {
      createTurn: vi.fn(async () => ({
        kind: 'created' as const,
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
        deployments,
      })),
    } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(async () => snapshot),
    } as unknown as TurnRepository;
    const orchestrator = {
      responseDefinitions: [],
      executeTurn: vi.fn().mockRejectedValue(new Error('provider-secret-must-not-leak')),
    } as unknown as TurnOrchestrator;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
    });

    await service.createTurn(snapshot.conversation.id, {
      clientRequestId: snapshot.turn.clientRequestId,
      prompt: snapshot.turn.prompt,
    });
    await vi.waitFor(() => expect(logSink.error).toHaveBeenCalledOnce());

    const logged = logSink.error.mock.calls[0]?.[0];
    expect(logged).toEqual(expect.objectContaining({
      conversationId: snapshot.conversation.id,
      turnId: snapshot.turn.id,
    }));
    expect(JSON.stringify(logged)).not.toContain(snapshot.turn.prompt);
    expect(JSON.stringify(logged)).not.toContain('provider-secret-must-not-leak');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function storedTurnSnapshot(
  deployments: ConversationDeploymentSnapshotTuple,
): StoredTurnSnapshot {
  const fixture = createConversationFixture();
  return {
    conversation: fixture.conversation,
    deployments,
    turn: fixture.turn,
  };
}

function publicDeployments(deployments: ConversationDeploymentSnapshotTuple) {
  return deployments.map(({ slot, deploymentId, providerId, modelId, displayName }) => ({
    slot,
    deploymentId,
    providerId,
    modelId,
    displayName,
  }));
}

function deploymentSnapshots(): ConversationDeploymentSnapshotTuple {
  const snapshot = <Slot extends ConversationDeploymentSnapshotTuple[number]['slot']>(
    slot: Slot,
    index: number,
  ) => ({
    slot,
    deploymentId: `deployment-${index}`,
    providerId: index % 2 === 0 ? 'openrouter' as const : 'openai' as const,
    modelId: `model-${index}`,
    displayName: `Deployment ${index}`,
    contextLimitTokens: 10_000 + index,
    maxOutputTokens: 1_000 + index,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
  });
  return [
    snapshot('base-1', 1),
    snapshot('base-2', 2),
    snapshot('base-3', 3),
    snapshot('consolidator', 4),
  ];
}

function defaultDeploymentSnapshots(): ConversationDeploymentSnapshotTuple {
  const snapshots = deploymentSnapshots();
  return [
    {
      ...snapshots[0],
      deploymentId: 'openai-5.6-sol',
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      displayName: 'GPT-5.6 Sol',
    },
    {
      ...snapshots[1],
      deploymentId: 'gemini-3.7-flash',
      providerId: 'google',
      modelId: 'gemini-3.7-flash',
      displayName: 'Gemini 3.7 Flash',
    },
    {
      ...snapshots[2],
      deploymentId: 'openrouter-minimax-m3',
      providerId: 'openrouter',
      modelId: 'minimax/minimax-m3',
      displayName: 'MiniMax M3',
    },
    {
      ...snapshots[3],
      deploymentId: 'openrouter-qwen-3.8-max',
      providerId: 'openrouter',
      modelId: 'qwen/qwen3.8-max',
      displayName: 'Qwen 3.8 Max',
    },
  ];
}
