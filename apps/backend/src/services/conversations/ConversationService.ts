import type { ConversationRepository } from '../../infrastructure/postgres/repositories/conversationRepository.js';
import type {
  ConversationDeploymentSnapshot,
  ConversationDeploymentSnapshotTuple,
  ConversationDeploymentSummary,
  ConversationDetail,
  ConversationPage,
  ConversationSummary,
  ConversationTurnResponse,
  CreateConversationRequest,
  CreateTurnRequest,
  RenameConversationRequest,
  ResponseSlot,
  TurnPage,
  TurnSnapshotResponse,
} from '../../types/conversations.js';
import type {
  StoredTurnSnapshot,
  TurnRepository,
} from '../../infrastructure/postgres/repositories/turnRepository.js';
import type { TurnEventSnapshot } from '../../types/sse.js';
import type { ModelCatalogService } from '../llm/ModelCatalogService.js';
import { logger } from '../../utils/logger.js';
import { truncateTitleGraphemes } from '../../utils/titleGraphemes.js';
import {
  ConversationError,
  DefaultProfileUnavailableError,
  DuplicateDeploymentAssignmentError,
} from './conversationErrors.js';
import type { TurnOrchestrator } from './TurnOrchestrator.js';

interface CommittedTurn {
  response: ConversationTurnResponse;
  deployments: ConversationDeploymentSnapshotTuple;
}

export class ConversationService {
  private readonly activeExecutions = new Set<Promise<void>>();

  constructor(
    private readonly dependencies: {
      conversationRepository: ConversationRepository;
      turnRepository: TurnRepository;
      orchestrator: TurnOrchestrator;
      modelCatalogService?: ModelCatalogService;
      sidebarPageSize?: number;
    }
  ) {}

  async createConversation(input: CreateConversationRequest): Promise<ConversationTurnResponse> {
    const prompt = input.prompt.trim();
    const replay = await this.dependencies.conversationRepository.findCreateReplay(
      input.clientRequestId,
      prompt
    );
    if (replay) {
      this.assertCreated(replay);
      const committed = await this.requireCommittedTurn(
        replay.conversationId,
        replay.turnId,
        replay.deployments
      );
      this.logReplay(committed.response);
      return committed.response;
    }
    const catalog = this.dependencies.modelCatalogService;
    if (!catalog) throw new Error('Model catalog service is unavailable');
    let deployments: ConversationDeploymentSnapshotTuple;
    if (input.deploymentIds) {
      const resolution = catalog.resolveExplicitAssignment(input.deploymentIds);
      if (resolution.kind === 'duplicate') {
        throw new DuplicateDeploymentAssignmentError();
      }
      if (resolution.kind === 'unavailable') {
        throw new ConversationError(
          422,
          'DEPLOYMENT_UNAVAILABLE',
          'One or more selected deployments are unavailable.'
        );
      }
      deployments = resolution.deployments;
    } else {
      const resolution = catalog.resolveDefaultAssignment();
      if (resolution.kind === 'unavailable') {
        throw new DefaultProfileUnavailableError(resolution.missingDeploymentIds);
      }
      deployments = resolution.deployments;
    }
    const created = await this.dependencies.conversationRepository.createConversation({
      clientRequestId: input.clientRequestId,
      prompt,
      title: truncateTitleGraphemes(prompt),
      deployments,
    });
    this.assertCreated(created);
    const committed = await this.requireCommittedTurn(
      created.conversationId,
      created.turnId,
      created.deployments
    );
    if (created.kind === 'created') {
      this.launch(committed, false);
    } else {
      this.logReplay(committed.response);
    }
    return committed.response;
  }

  async createTurn(
    conversationId: string,
    input: CreateTurnRequest
  ): Promise<ConversationTurnResponse> {
    const created = await this.dependencies.conversationRepository.createTurn(conversationId, {
      clientRequestId: input.clientRequestId,
      prompt: input.prompt.trim(),
    });
    switch (created.kind) {
      case 'conversation_not_found':
        throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      case 'busy':
        logger.info({
          message: 'Conversation rejected new work while busy',
          operation: 'conversation_busy',
          conversationId,
          hasWorkInProgress: true,
        });
        throw new ConversationError(
          409,
          'CONVERSATION_BUSY',
          'The conversation has work in progress.'
        );
      case 'conflict':
        throw new ConversationError(
          409,
          'CLIENT_REQUEST_ID_CONFLICT',
          'The request ID belongs to a different prompt.'
        );
      case 'created':
      case 'replay': {
        const committed = await this.requireCommittedTurn(
          created.conversationId,
          created.turnId,
          created.deployments
        );
        if (created.kind === 'created') this.launch(committed, false);
        else this.logReplay(committed.response);
        return committed.response;
      }
    }
  }

  listConversations(cursor?: string): Promise<ConversationPage> {
    return this.dependencies.conversationRepository.listConversations(
      this.dependencies.sidebarPageSize ?? 20,
      cursor
    );
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    const conversation =
      await this.dependencies.conversationRepository.getConversation(conversationId);
    if (!conversation) {
      throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }
    return conversation;
  }

  async listTurns(conversationId: string, before?: string): Promise<TurnPage> {
    await this.getConversation(conversationId);
    return this.dependencies.conversationRepository.listTurns(conversationId, before);
  }

  async renameConversation(
    conversationId: string,
    input: RenameConversationRequest
  ): Promise<ConversationSummary> {
    const conversation = await this.dependencies.conversationRepository.renameConversation(
      conversationId,
      input.title
    );
    if (!conversation) {
      throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }
    return conversation;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const result =
      await this.dependencies.conversationRepository.deleteConversation(conversationId);
    if (result === 'not_found') {
      throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }
    if (result === 'busy') {
      logger.info({
        message: 'Conversation deletion rejected while busy',
        operation: 'conversation_busy',
        conversationId,
        hasWorkInProgress: true,
      });
      throw new ConversationError(
        409,
        'CONVERSATION_BUSY',
        'The conversation has work in progress.'
      );
    }
  }

  async getTurn(conversationId: string, turnId: string): Promise<TurnSnapshotResponse> {
    const snapshot = (await this.requireCommittedTurn(conversationId, turnId)).response;
    return {
      conversation: {
        id: snapshot.conversation.id,
        hasWorkInProgress: snapshot.conversation.hasWorkInProgress,
      },
      turn: snapshot.turn,
    };
  }

  async getTurnSnapshot(conversationId: string, turnId: string): Promise<TurnEventSnapshot> {
    const lastEventSequence = this.dependencies.orchestrator.getLastEventSequence(turnId);
    const snapshot = (await this.requireCommittedTurn(conversationId, turnId)).response;
    return {
      conversationId: snapshot.conversation.id,
      turnId: snapshot.turn.id,
      turn: snapshot.turn,
      hasWorkInProgress: snapshot.conversation.hasWorkInProgress,
      updatedAt: snapshot.conversation.updatedAt,
      lastEventSequence,
    };
  }

  async retryResponse(
    conversationId: string,
    turnId: string,
    slot: ResponseSlot
  ): Promise<ConversationTurnResponse> {
    const prepared = await this.dependencies.turnRepository.prepareRetry(
      conversationId,
      turnId,
      slot
    );
    switch (prepared.kind) {
      case 'conversation_not_found':
        throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      case 'response_not_found':
        throw new ConversationError(404, 'RESPONSE_NOT_FOUND', 'Response not found.');
      case 'conversation_busy':
        logger.info({
          message: 'Response retry rejected while conversation is busy',
          operation: 'conversation_busy',
          conversationId,
          turnId,
          slot,
          hasWorkInProgress: true,
        });
        throw new ConversationError(
          409,
          'CONVERSATION_BUSY',
          'The conversation has work in progress.'
        );
      case 'retry_in_progress':
        throw new ConversationError(
          409,
          'RESPONSE_RETRY_IN_PROGRESS',
          'The response retry is already in progress.'
        );
      case 'not_retryable':
        throw new ConversationError(
          409,
          'RESPONSE_NOT_RETRYABLE',
          'The response is not retryable.'
        );
      case 'accepted': {
        const committed = await this.completeSnapshot(prepared.snapshot);
        this.dependencies.orchestrator.publishSnapshot(prepared.snapshot, slot);
        this.launch(committed, true, slot);
        return committed.response;
      }
    }
  }

  async continueWithout(
    conversationId: string,
    turnId: string,
    slot: ResponseSlot
  ): Promise<ConversationTurnResponse> {
    const continued = await this.dependencies.turnRepository.continueWithout(
      conversationId,
      turnId,
      slot
    );
    switch (continued.kind) {
      case 'conversation_not_found':
        throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      case 'response_not_found':
        throw new ConversationError(404, 'RESPONSE_NOT_FOUND', 'Response not found.');
      case 'not_allowed':
        throw new ConversationError(
          409,
          'CONTINUE_WITHOUT_NOT_ALLOWED',
          'Continue-without is not allowed.'
        );
      case 'accepted': {
        const committed = await this.completeSnapshot(continued.snapshot);
        this.dependencies.orchestrator.publishSnapshot(continued.snapshot, slot);
        return committed.response;
      }
    }
  }

  private async requireCommittedTurn(
    conversationId: string,
    turnId: string,
    deployments?: ConversationDeploymentSnapshotTuple
  ): Promise<CommittedTurn> {
    const snapshot = await this.dependencies.turnRepository.getTurnSnapshot(conversationId, turnId);
    if (!snapshot) throw new ConversationError(404, 'TURN_NOT_FOUND', 'Turn not found.');
    return this.completeSnapshot(snapshot, deployments);
  }

  private completeSnapshot(
    snapshot: StoredTurnSnapshot,
    deployments: ConversationDeploymentSnapshotTuple = snapshot.deployments
  ): CommittedTurn {
    return {
      deployments,
      response: {
        conversation: {
          ...snapshot.conversation,
          deployments: [
            toPublicDeployment(deployments[0]),
            toPublicDeployment(deployments[1]),
            toPublicDeployment(deployments[2]),
            toPublicDeployment(deployments[3]),
          ],
        },
        turn: snapshot.turn,
      },
    };
  }

  private assertCreated(
    result: Awaited<ReturnType<ConversationRepository['createConversation']>>
  ): asserts result is Extract<typeof result, { kind: 'created' | 'replay' }> {
    if (result.kind === 'duplicate_deployment_assignment') {
      throw new DuplicateDeploymentAssignmentError();
    }
    if (result.kind === 'conflict') {
      throw new ConversationError(
        409,
        'CLIENT_REQUEST_ID_CONFLICT',
        'The request ID belongs to a different prompt.'
      );
    }
  }

  private logReplay(snapshot: ConversationTurnResponse): void {
    logger.info({
      message: 'Existing turn replayed',
      operation: 'turn_replayed',
      conversationId: snapshot.conversation.id,
      turnId: snapshot.turn.id,
      replay: true,
      hasWorkInProgress: snapshot.conversation.hasWorkInProgress,
    });
  }

  private launch(snapshot: CommittedTurn, retry: boolean, slot?: ResponseSlot): void {
    const input = {
      conversationId: snapshot.response.conversation.id,
      turnId: snapshot.response.turn.id,
      prompt: snapshot.response.turn.prompt,
      currentOrdinal: snapshot.response.turn.ordinal,
      deployments: snapshot.deployments,
      signal: new AbortController().signal,
    };
    let tracked!: Promise<void>;
    tracked = Promise.resolve()
      .then(() =>
        retry && slot
          ? this.dependencies.orchestrator.executeRetry({ ...input, slot })
          : this.dependencies.orchestrator.executeTurn(input)
      )
      .catch(() => this.reconcileRejectedExecution(snapshot.response))
      .finally(() => this.activeExecutions.delete(tracked));
    this.activeExecutions.add(tracked);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.activeExecutions]);
  }

  private async reconcileRejectedExecution(snapshot: ConversationTurnResponse): Promise<void> {
    logger.error({
      message: 'Background turn execution failed unexpectedly',
      operation: 'turn_execution_rejected',
      conversationId: snapshot.conversation.id,
      turnId: snapshot.turn.id,
    });

    try {
      const reconciled = await this.dependencies.turnRepository.reconcileInterruptedTurn?.(
        snapshot.conversation.id,
        snapshot.turn.id
      );
      if (reconciled) {
        this.dependencies.orchestrator.publishSnapshot(reconciled.snapshot, reconciled.slots);
      }
    } catch {
      logger.error({
        message: 'Background turn reconciliation failed',
        operation: 'turn_reconciliation_failed',
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
      });
    }
  }
}

function toPublicDeployment<Slot extends ConversationDeploymentSnapshot['slot']>(
  deployment: ConversationDeploymentSnapshot<Slot>
): ConversationDeploymentSummary<Slot> {
  const { slot, deploymentId, providerId, modelId, displayName } = deployment;
  return { slot, deploymentId, providerId, modelId, displayName };
}
