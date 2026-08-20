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
import type { TurnOrchestrator } from '../TurnOrchestrator.js';

const logSink = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../../../utils/logger.js', () => ({
  logger: { error: logSink.error, info: vi.fn(), warn: vi.fn() },
}));

describe('ConversationService background execution', () => {
  it('commits the complete canonical assignment and reads it back before provider work starts', async () => {
    const trace: string[] = [];
    const committed = deferred<{ kind: 'created'; conversationId: string; turnId: string }>();
    const stored = createConversationFixture() as unknown as StoredTurnSnapshot;
    const deployments = deploymentSnapshots();
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
      createConversation,
      getConversationDeployments: vi.fn(async () => {
        trace.push('read:deployments');
        return deployments;
      }),
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
    });
    const result = await creation;
    await service.stop();

    expect(trace).toEqual(['transaction', 'read:turn', 'read:deployments', 'provider-work']);
    expect(result.conversation.deployments.map(({ slot }) => slot)).toEqual([
      'base-1',
      'base-2',
      'base-3',
      'consolidator',
    ]);
    expect(orchestrator.executeTurn).toHaveBeenCalledWith(expect.objectContaining({ deployments }));
  });

  it('logs an orchestration rejection with safe identifiers and no prompt or error detail', async () => {
    const snapshot = createConversationFixture() as StoredTurnSnapshot;
    snapshot.turn.prompt = 'prompt-canary-must-not-leak';
    const conversationRepository = {
      createTurn: vi.fn(async () => ({
        kind: 'created' as const,
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
      })),
      getConversationDeployments: vi.fn(async () => deploymentSnapshots()),
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
