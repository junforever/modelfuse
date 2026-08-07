import type { ConversationRepository } from '../../infrastructure/postgres/repositories/conversationRepository.js';
import type {
  StoredTurnSnapshot,
  TurnRepository,
} from '../../infrastructure/postgres/repositories/turnRepository.js';
import type {
  ConversationTurnResponse,
  CreateConversationRequest,
  ResponseSlot,
  TurnSnapshotResponse,
} from '../../types/conversations.js';
import type { TurnEventSnapshot } from '../../types/sse.js';
import { truncateTitleGraphemes } from '../../utils/titleGraphemes.js';
import { ConversationError } from './conversationErrors.js';
import type { TurnOrchestrator } from './TurnOrchestrator.js';

export class ConversationService {
  constructor(
    private readonly dependencies: {
      conversationRepository: ConversationRepository;
      turnRepository: TurnRepository;
      orchestrator: TurnOrchestrator;
    },
  ) {}

  async createConversation(input: CreateConversationRequest): Promise<ConversationTurnResponse> {
    const prompt = input.prompt.trim();
    const created = await this.dependencies.conversationRepository.createConversation({
      clientRequestId: input.clientRequestId,
      prompt,
      title: truncateTitleGraphemes(prompt),
      responses: this.dependencies.orchestrator.responseDefinitions,
    });
    this.assertCreated(created);
    const snapshot = await this.requireSnapshot(created.conversationId, created.turnId);
    if (created.kind === 'created') this.launch(snapshot, false);
    return snapshot;
  }

  async getTurn(conversationId: string, turnId: string): Promise<TurnSnapshotResponse> {
    const snapshot = await this.requireSnapshot(conversationId, turnId);
    return {
      conversation: {
        id: snapshot.conversation.id,
        hasWorkInProgress: snapshot.conversation.hasWorkInProgress,
      },
      turn: snapshot.turn,
    };
  }

  async getTurnSnapshot(conversationId: string, turnId: string): Promise<TurnEventSnapshot> {
    const snapshot = await this.requireSnapshot(conversationId, turnId);
    return {
      conversationId: snapshot.conversation.id,
      turnId: snapshot.turn.id,
      turn: snapshot.turn,
      hasWorkInProgress: snapshot.conversation.hasWorkInProgress,
      updatedAt: snapshot.conversation.updatedAt,
      lastEventSequence: this.dependencies.orchestrator.getLastEventSequence(turnId),
    };
  }

  async retryResponse(
    conversationId: string,
    turnId: string,
    slot: ResponseSlot,
  ): Promise<ConversationTurnResponse> {
    const prepared = await this.dependencies.turnRepository.prepareRetry(conversationId, turnId, slot);
    switch (prepared.kind) {
      case 'conversation_not_found':
        throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      case 'response_not_found':
        throw new ConversationError(404, 'RESPONSE_NOT_FOUND', 'Response not found.');
      case 'conversation_busy':
        throw new ConversationError(409, 'CONVERSATION_BUSY', 'The conversation has work in progress.');
      case 'retry_in_progress':
        throw new ConversationError(409, 'RESPONSE_RETRY_IN_PROGRESS', 'The response retry is already in progress.');
      case 'not_retryable':
        throw new ConversationError(409, 'RESPONSE_NOT_RETRYABLE', 'The response is not retryable.');
      case 'accepted':
        this.dependencies.orchestrator.publishSnapshot(prepared.snapshot, slot);
        this.launch(prepared.snapshot, true, slot);
        return prepared.snapshot;
    }
  }

  async continueWithout(
    conversationId: string,
    turnId: string,
    slot: ResponseSlot,
  ): Promise<ConversationTurnResponse> {
    const continued = await this.dependencies.turnRepository.continueWithout(
      conversationId,
      turnId,
      slot,
    );
    switch (continued.kind) {
      case 'conversation_not_found':
        throw new ConversationError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      case 'response_not_found':
        throw new ConversationError(404, 'RESPONSE_NOT_FOUND', 'Response not found.');
      case 'not_allowed':
        throw new ConversationError(409, 'CONTINUE_WITHOUT_NOT_ALLOWED', 'Continue-without is not allowed.');
      case 'accepted':
        this.dependencies.orchestrator.publishSnapshot(continued.snapshot, slot);
        return continued.snapshot;
    }
  }

  private async requireSnapshot(
    conversationId: string,
    turnId: string,
  ): Promise<StoredTurnSnapshot> {
    const snapshot = await this.dependencies.turnRepository.getTurnSnapshot(conversationId, turnId);
    if (!snapshot) throw new ConversationError(404, 'TURN_NOT_FOUND', 'Turn not found.');
    return snapshot;
  }

  private assertCreated(
    result: Awaited<ReturnType<ConversationRepository['createConversation']>>,
  ): asserts result is Extract<typeof result, { kind: 'created' | 'replay' }> {
    if (result.kind === 'conflict') {
      throw new ConversationError(409, 'CLIENT_REQUEST_ID_CONFLICT', 'The request ID belongs to a different prompt.');
    }
  }

  private launch(snapshot: StoredTurnSnapshot, retry: boolean, slot?: ResponseSlot): void {
    const input = {
      conversationId: snapshot.conversation.id,
      turnId: snapshot.turn.id,
      prompt: snapshot.turn.prompt,
      signal: new AbortController().signal,
    };
    const execution = retry && slot
      ? this.dependencies.orchestrator.executeRetry({ ...input, slot })
      : this.dependencies.orchestrator.executeTurn(input);
    void execution.catch(() => undefined);
  }
}
