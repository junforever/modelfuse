import { randomUUID } from 'node:crypto';

import type { ResponseDefinition } from '../../infrastructure/postgres/repositories/conversationRepository.js';
import type {
  PersistResponseAttemptInput,
  StoredTurnSnapshot,
} from '../../infrastructure/postgres/repositories/turnRepository.js';
import type { ModelResponse, ResponseSlot } from '../../types/conversations.js';
import type {
  LlmErrorCode,
  LlmMessage,
  LlmProvider,
  LlmProviderError,
  LlmResult,
} from '../../types/llm.js';
import { isRecoverableLlmError } from '../llm/llmErrors.js';
import { protectContext } from './contextProtection.js';
import type { UnsequencedTurnEvent } from './turnEventPublisher.js';

const BASE_SLOTS = ['openai', 'google', 'minimax'] as const;
const CONTEXT_THRESHOLD_RATIO = 0.8;

interface TurnRepositoryPort {
  startResponseAttempt?: (input: {
    conversationId: string;
    turnId: string;
    slot: ResponseSlot;
  }) => Promise<{ attemptNo: number; snapshot: StoredTurnSnapshot } | null>;
  persistResponseAttempt(input: PersistResponseAttemptInput): Promise<StoredTurnSnapshot | null | undefined>;
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
      providerRegistry: Record<ResponseSlot, LlmProvider>;
      turnRepository: TurnRepositoryPort;
      publisher: PublisherPort;
      contextThresholdRatio?: number;
    },
  ) {}

  get responseDefinitions(): readonly ResponseDefinition[] {
    return (Object.keys(this.dependencies.providerRegistry) as ResponseSlot[]).map(slot => {
      const provider = this.dependencies.providerRegistry[slot];
      return {
        slot,
        role: slot === 'qwen' ? 'consolidator' : 'base',
        provider: provider.provider,
        model: provider.model,
      };
    });
  }

  getLastEventSequence(turnId: string): number {
    return this.dependencies.publisher.getLastEventSequence?.(turnId) ?? 0;
  }

  async executeTurn(input: ExecuteTurnInput): Promise<void> {
    const baseExecutions = BASE_SLOTS.map(slot =>
      this.executeSlot({ ...input, slot, messages: this.baseMessages(input.prompt) }),
    );
    const baseResults = await Promise.all(baseExecutions);
    await this.executeSlot({
      ...input,
      slot: 'qwen',
      messages: this.qwenMessages(input.prompt, baseResults),
    });
  }

  async executeRetry(input: ExecuteRetryInput): Promise<void> {
    if (input.slot === 'qwen') {
      await this.executeSlot({
        ...input,
        messages: this.qwenMessages(input.prompt, await this.availableBases(input.turnId)),
      });
      return;
    }

    const retried = await this.executeSlot({
      ...input,
      messages: this.baseMessages(input.prompt),
      reconsolidateOnSuccess: true,
    });
    if (!retried.result) return;
    await this.executeSlot({
      ...input,
      slot: 'qwen',
      messages: this.qwenMessages(input.prompt, await this.availableBases(input.turnId)),
    });
  }

  publishSnapshot(snapshot: StoredTurnSnapshot, slot?: ResponseSlot): void {
    if (slot) {
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
      messages: LlmMessage[];
      reconsolidateOnSuccess?: boolean;
    },
  ): Promise<SlotExecutionResult> {
    const provider = this.dependencies.providerRegistry[input.slot];
    const protectedContext = protectContext({
      systemMessage: input.messages[0] ?? { role: 'system', content: 'Answer the user.' },
      historicalTurns: [],
      auxiliaryMessages: input.messages.slice(1, -1),
      currentPrompt: input.messages.at(-1) ?? { role: 'user', content: input.prompt },
      currentOrdinal: 1,
      context: provider.context,
      thresholdRatio: this.dependencies.contextThresholdRatio ?? CONTEXT_THRESHOLD_RATIO,
    });
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
      return { slot: input.slot, result: null };
    }

    try {
      const result = await provider.generate({
        operationId: randomUUID(),
        slot: input.slot,
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
        reconsolidateQwen: input.reconsolidateOnSuccess,
      });
      return { slot: input.slot, result };
    } catch (error) {
      const failure = this.normalizeFailure(error, provider);
      await this.persist(input, {
        attemptNo,
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.safeMessage,
        errorRecoverable: failure.recoverable,
        metadata: { contextWindow: protectedContext.contextWindow },
        startedAt: attemptStartedAt,
        completedAt: new Date().toISOString(),
      });
      return { slot: input.slot, result: null };
    }
  }

  private async persist(
    input: Pick<ExecuteTurnInput, 'turnId'> & { slot: ResponseSlot },
    attempt: Omit<PersistResponseAttemptInput, 'turnId' | 'slot'>,
  ): Promise<void> {
    const snapshot = await this.dependencies.turnRepository.persistResponseAttempt({
      turnId: input.turnId,
      slot: input.slot,
      ...attempt,
    });
    if (snapshot) {
      this.publishSnapshot(snapshot, input.slot);
    } else {
      await this.dependencies.turnRepository.recalculateTurn?.(input.turnId);
    }
  }

  private baseMessages(prompt: string): LlmMessage[] {
    return [
      { role: 'system', content: 'Provide a complete, accurate answer to the user prompt.' },
      { role: 'user', content: prompt },
    ];
  }

  private qwenMessages(
    prompt: string,
    responses: readonly SlotExecutionResult[] | readonly ModelResponse[],
  ): LlmMessage[] {
    const available = responses.flatMap(response => {
      const slot = response.slot;
      const content = 'result' in response ? response.result?.content : response.content;
      return content ? [{ role: 'user' as const, content: `${slot}:\n${content}` }] : [];
    });
    return [
      { role: 'system', content: 'Consolidate the available model answers into one final answer.' },
      ...available,
      { role: 'user', content: prompt },
    ];
  }

  private async availableBases(turnId: string): Promise<ModelResponse[]> {
    return (await this.dependencies.turnRepository.getAvailableBaseResponses?.(turnId)) ?? [];
  }

  private normalizeFailure(error: unknown, provider: LlmProvider): LlmProviderError {
    if (this.isProviderError(error)) {
      return {
        code: error.code,
        safeMessage: error.safeMessage,
        provider: provider.provider,
        model: provider.model,
        recoverable: isRecoverableLlmError(error.code),
      };
    }
    return {
      code: 'provider_error',
      safeMessage: `${provider.provider} request failed.`,
      provider: provider.provider,
      model: provider.model,
      recoverable: false,
    };
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
