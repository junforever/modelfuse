import type {
  PersistResponseAttemptInput,
  StoredTurnSnapshot,
} from '../../infrastructure/postgres/repositories/turnRepository.js';
import type {
  ContextWindowMetadata,
  ConversationDeploymentSnapshot,
  ConversationDeploymentSnapshotTuple,
  ModelResponse,
  ResponseSlot,
} from '../../types/conversations.js';
import type {
  LlmErrorCode,
  LlmProviderError,
  LlmResult,
  ProviderRegistry,
} from '../../types/llm.js';
import { logger } from '../../utils/logger.js';
import { isRecoverableLlmError } from '../llm/llmErrors.js';
import type { ContextBuilder } from './ContextBuilder.js';
import type { UnsequencedTurnEvent } from './turnEventPublisher.js';

const BASE_SLOTS = ['base-1', 'base-2', 'base-3'] as const;

interface TurnRepositoryPort {
  startResponseAttempt?: (input: {
    conversationId: string;
    turnId: string;
    slot: ResponseSlot;
  }) => Promise<{ attemptNo: number; snapshot: StoredTurnSnapshot } | null>;
  persistResponseAttempt(
    input: PersistResponseAttemptInput
  ): Promise<StoredTurnSnapshot | null | undefined>;
  recalculateTurn?: (turnId: string) => Promise<StoredTurnSnapshot | null | undefined>;
  getAvailableBaseResponses?: (turnId: string) => Promise<ModelResponse[]>;
}

interface PublisherPort {
  publish(event: UnsequencedTurnEvent): unknown;
  getLastEventSequence?: (turnId: string) => number;
}

interface ExecuteTurnInput {
  conversationId: string;
  turnId: string;
  prompt: string;
  currentOrdinal?: number;
  deployments: ConversationDeploymentSnapshotTuple;
  signal: AbortSignal;
}

interface ExecuteRetryInput extends ExecuteTurnInput {
  slot: ResponseSlot;
}

interface SlotExecutionResult {
  slot: ResponseSlot;
  result: LlmResult | null;
}

export class TurnOrchestrator {
  constructor(
    private readonly dependencies: {
      providerRegistry: ProviderRegistry;
      turnRepository: TurnRepositoryPort;
      publisher: PublisherPort;
      contextBuilder: Pick<ContextBuilder, 'build'>;
    }
  ) {}

  getLastEventSequence(turnId: string): number {
    return this.dependencies.publisher.getLastEventSequence?.(turnId) ?? 0;
  }

  async executeTurn(input: ExecuteTurnInput): Promise<void> {
    const baseResults = await Promise.all(
      BASE_SLOTS.map(slot => this.executeSlot({ ...input, slot }))
    );
    await this.executeSlot({
      ...input,
      slot: 'consolidator',
      currentBaseResponses: baseResults.map(({ slot, result }) => ({
        slot,
        content: result?.content ?? null,
      })),
    });
  }

  async executeRetry(input: ExecuteRetryInput): Promise<void> {
    if (input.slot === 'consolidator') {
      await this.executeSlot({
        ...input,
        currentBaseResponses: await this.availableBases(input.turnId),
      });
      return;
    }

    const retried = await this.executeSlot(input);
    if (!retried.result) return;
    await this.executeSlot({
      ...input,
      slot: 'consolidator',
      currentBaseResponses: await this.availableBases(input.turnId),
    });
  }

  publishSnapshot(
    snapshot: StoredTurnSnapshot,
    slots?: ResponseSlot | readonly ResponseSlot[]
  ): void {
    for (const slot of slots ? (Array.isArray(slots) ? slots : [slots]) : []) {
      const response = snapshot.turn.responses.find(candidate => candidate.slot === slot);
      if (response) {
        this.dependencies.publisher.publish({
          event: 'slot_update',
          data: {
            conversationId: snapshot.conversation.id,
            turnId: snapshot.turn.id,
            response,
          },
        });
      }
    }
    this.dependencies.publisher.publish({
      event: 'turn_update',
      data: {
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
        turn: {
          id: snapshot.turn.id,
          status: snapshot.turn.status,
          updatedAt: snapshot.turn.updatedAt,
        },
      },
    });
    this.dependencies.publisher.publish({
      event: 'busy_update',
      data: {
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
        hasWorkInProgress: snapshot.conversation.hasWorkInProgress,
        updatedAt: snapshot.conversation.updatedAt,
      },
    });
  }

  private async executeSlot(
    input: ExecuteTurnInput & {
      slot: ResponseSlot;
      currentBaseResponses?: readonly Pick<ModelResponse, 'slot' | 'content'>[];
    }
  ): Promise<SlotExecutionResult> {
    const deployment = input.deployments.find(candidate => candidate.slot === input.slot);
    if (!deployment) throw new Error(`Missing persisted deployment for slot ${input.slot}`);

    const started = await this.dependencies.turnRepository.startResponseAttempt?.({
      conversationId: input.conversationId,
      turnId: input.turnId,
      slot: input.slot,
    });
    if (this.dependencies.turnRepository.startResponseAttempt && !started) {
      return { slot: input.slot, result: null };
    }
    const attemptNo = started?.attemptNo ?? 1;
    if (started) this.publishSnapshot(started.snapshot, input.slot);
    const attemptStartedAt = new Date().toISOString();
    const provider = this.dependencies.providerRegistry[deployment.providerId];

    if (!provider) {
      const failure = this.unavailableProvider(deployment);
      await this.persistFailure(input, attemptNo, attemptStartedAt, failure);
      this.logAttemptCompleted(input, deployment, 0, 'failed', failure.code);
      return { slot: input.slot, result: null };
    }

    const protectedContext = await this.buildContext(input, provider, deployment);
    if (!protectedContext.ok) {
      await this.persist(input, {
        attemptNo,
        status: 'failed',
        errorCode: protectedContext.error.code,
        errorMessage: protectedContext.error.message,
        errorRecoverable: false,
        metadata: {},
        startedAt: attemptStartedAt,
        completedAt: new Date().toISOString(),
      });
      this.logAttemptCompleted(input, deployment, 0, 'failed', protectedContext.error.code);
      return { slot: input.slot, result: null };
    }

    try {
      const result = await provider.generate({
        slot: input.slot,
        deployment,
        messages: protectedContext.messages,
        signal: input.signal,
      });
      const durationMs = Math.max(0, Date.parse(result.completedAt) - Date.parse(result.startedAt));
      await this.persist(input, {
        attemptNo,
        status: 'completed',
        content: result.content,
        metadata: {
          durationMs: Number.isFinite(durationMs) ? durationMs : 0,
          contextWindow: protectedContext.contextWindow,
        },
        startedAt: result.startedAt,
        completedAt: result.completedAt,
      });
      this.logAttemptCompleted(input, deployment, durationMs, 'completed');
      return { slot: input.slot, result };
    } catch (error) {
      const failedAt = Date.now();
      const failure = this.normalizeFailure(error, deployment);
      await this.persistFailure(
        input,
        attemptNo,
        attemptStartedAt,
        failure,
        protectedContext.contextWindow
      );
      this.logAttemptCompleted(
        input,
        deployment,
        Math.max(0, failedAt - Date.parse(attemptStartedAt)),
        'failed',
        failure.code
      );
      return { slot: input.slot, result: null };
    }
  }

  private async buildContext(
    input: ExecuteTurnInput & {
      slot: ResponseSlot;
      currentBaseResponses?: readonly Pick<ModelResponse, 'slot' | 'content'>[];
    },
    provider: NonNullable<ProviderRegistry[keyof ProviderRegistry]>,
    deployment: ConversationDeploymentSnapshot
  ): ReturnType<ContextBuilder['build']> {
    return this.dependencies.contextBuilder.build({
      conversationId: input.conversationId,
      currentOrdinal: input.currentOrdinal ?? 1,
      prompt: input.prompt,
      currentBaseResponses: input.currentBaseResponses,
      deployment,
      measureInputTokens: (selectedDeployment, messages) =>
        provider.measureInputTokens(selectedDeployment, messages),
    });
  }

  private async persistFailure(
    input: Pick<ExecuteTurnInput, 'turnId'> & { slot: ResponseSlot },
    attemptNo: number,
    startedAt: string,
    failure: LlmProviderError,
    contextWindow?: ContextWindowMetadata
  ): Promise<void> {
    await this.persist(input, {
      attemptNo,
      status: 'failed',
      errorCode: failure.code,
      errorMessage: failure.safeMessage,
      errorRecoverable: failure.recoverable,
      metadata: contextWindow ? { contextWindow } : {},
      startedAt,
      completedAt: new Date().toISOString(),
    });
  }

  private async persist(
    input: Pick<ExecuteTurnInput, 'turnId'> & { slot: ResponseSlot },
    attempt: Omit<PersistResponseAttemptInput, 'turnId' | 'slot'>
  ): Promise<void> {
    const reconsolidateConsolidator =
      input.slot !== 'consolidator' && attempt.status === 'completed' && attempt.attemptNo > 1;
    const snapshot = await this.dependencies.turnRepository.persistResponseAttempt({
      turnId: input.turnId,
      slot: input.slot,
      ...attempt,
      reconsolidateConsolidator,
    });
    if (snapshot) {
      this.publishSnapshot(
        snapshot,
        reconsolidateConsolidator ? [input.slot, 'consolidator'] : input.slot
      );
    } else {
      await this.dependencies.turnRepository.recalculateTurn?.(input.turnId);
    }
  }

  private async availableBases(turnId: string): Promise<ModelResponse[]> {
    return (await this.dependencies.turnRepository.getAvailableBaseResponses?.(turnId)) ?? [];
  }

  private normalizeFailure(
    error: unknown,
    deployment: ConversationDeploymentSnapshot
  ): LlmProviderError {
    if (this.isProviderError(error)) {
      return {
        code: error.code,
        safeMessage: error.safeMessage,
        provider: deployment.providerId,
        model: deployment.modelId,
        recoverable: isRecoverableLlmError(error.code),
      };
    }
    return this.unavailableProvider(deployment);
  }

  private unavailableProvider(deployment: ConversationDeploymentSnapshot): LlmProviderError {
    return {
      code: 'provider_error',
      safeMessage: 'The selected model provider request failed.',
      provider: deployment.providerId,
      model: deployment.modelId,
      recoverable: false,
    };
  }

  private logAttemptCompleted(
    input: ExecuteTurnInput & { slot: ResponseSlot },
    deployment: ConversationDeploymentSnapshot,
    durationMs: number,
    status: 'completed' | 'failed',
    errorCode?: string
  ): void {
    logger.info({
      message: 'LLM attempt completed',
      operation: 'llm_attempt_completed',
      conversationId: input.conversationId,
      turnId: input.turnId,
      slot: input.slot,
      provider: deployment.providerId,
      model: deployment.modelId,
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      status,
      ...(errorCode ? { errorCode } : {}),
    });
  }

  private isProviderError(error: unknown): error is LlmProviderError {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as Partial<LlmProviderError>;
    return this.isLlmErrorCode(candidate.code) && typeof candidate.safeMessage === 'string';
  }

  private isLlmErrorCode(code: unknown): code is LlmErrorCode {
    return (
      typeof code === 'string' &&
      [
        'authentication',
        'rate_limited',
        'timeout',
        'connectivity',
        'content_blocked',
        'invalid_prompt_size',
        'invalid_response',
        'provider_transient_error',
        'provider_error',
      ].includes(code)
    );
  }
}
