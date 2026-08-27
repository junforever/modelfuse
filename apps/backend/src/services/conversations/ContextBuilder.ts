import type {
  ContextRepositoryPort,
  ContextTurn,
} from '../../infrastructure/postgres/repositories/contextRepository.js';
import type { ConversationDeploymentSnapshot, ResponseSlot } from '../../types/conversations.js';
import type { LlmMessage, LlmProvider } from '../../types/llm.js';
import { protectContext } from './contextProtection.js';

const BASE_SLOTS = ['base-1', 'base-2', 'base-3'] as const;

interface CurrentBaseResponse {
  slot: ResponseSlot;
  content: string | null;
}

export class ContextBuilder {
  constructor(
    private readonly dependencies: {
      contextRepository: ContextRepositoryPort;
      maxTurns: number;
      thresholdRatio: number;
    }
  ) {}

  async build(input: {
    conversationId: string;
    currentOrdinal: number;
    prompt: string;
    currentBaseResponses?: readonly CurrentBaseResponse[];
    deployment: ConversationDeploymentSnapshot;
    measureInputTokens: LlmProvider['measureInputTokens'];
  }) {
    const slot = input.deployment.slot;
    const history =
      slot === 'consolidator'
        ? await this.dependencies.contextRepository.getConsolidatorContext({
            conversationId: input.conversationId,
            beforeOrdinal: input.currentOrdinal,
            maxTurns: this.dependencies.maxTurns,
          })
        : await this.dependencies.contextRepository.getBaseContext({
            conversationId: input.conversationId,
            beforeOrdinal: input.currentOrdinal,
            slot,
            maxTurns: this.dependencies.maxTurns,
          });

    const protectedContext = await protectContext({
      systemMessage: {
        role: 'system',
        content:
          slot === 'consolidator'
            ? 'Consolidate the available model answers into one final answer.'
            : 'Provide a complete, accurate answer to the user prompt.',
      },
      historicalTurns: history.map(this.toHistoricalTurn),
      auxiliaryMessages:
        slot === 'consolidator' ? this.baseResponseMessages(input.currentBaseResponses ?? []) : [],
      currentPrompt: { role: 'user', content: input.prompt },
      currentOrdinal: input.currentOrdinal,
      deployment: input.deployment,
      measureInputTokens: input.measureInputTokens,
      thresholdRatio: this.dependencies.thresholdRatio,
    });
    if (!protectedContext.ok || (history[0]?.ordinal ?? 1) === 1) return protectedContext;

    return {
      ...protectedContext,
      contextWindow: {
        ...protectedContext.contextWindow,
        truncated: true,
        protectionApplied:
          protectedContext.contextWindow.protectionApplied === 'truncate'
            ? 'turn-window-and-truncate'
            : protectedContext.contextWindow.protectionApplied === 'none'
              ? 'turn-window'
              : protectedContext.contextWindow.protectionApplied,
      },
    };
  }

  private readonly toHistoricalTurn = (
    turn: ContextTurn
  ): {
    ordinal: number;
    messages: LlmMessage[];
  } => ({
    ordinal: turn.ordinal,
    messages: [
      { role: 'user', content: turn.prompt },
      ...(turn.response ? [{ role: 'assistant' as const, content: turn.response }] : []),
    ],
  });

  private baseResponseMessages(responses: readonly CurrentBaseResponse[]): LlmMessage[] {
    const bySlot = new Map(responses.map(response => [response.slot, response.content]));
    return BASE_SLOTS.map(slot => ({
      role: 'user',
      content: `${slot}:\n${bySlot.get(slot) ?? '[unavailable]'}`,
    }));
  }
}
