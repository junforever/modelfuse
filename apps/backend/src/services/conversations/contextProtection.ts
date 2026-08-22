import type { ContextWindowMetadata } from '../../types/conversations.js';
import type { LlmContextCapabilities, LlmMessage } from '../../types/llm.js';

export const CONTEXT_TRUNCATION_MARKER = '[context truncated]';

interface HistoricalTurn {
  ordinal: number;
  messages: LlmMessage[];
}

interface ProtectContextInput {
  systemMessage: LlmMessage;
  historicalTurns: HistoricalTurn[];
  auxiliaryMessages: LlmMessage[];
  currentPrompt: LlmMessage;
  currentOrdinal: number;
  context: LlmContextCapabilities;
  thresholdRatio: number;
}

type ProtectedContext =
  | {
      ok: true;
      messages: LlmMessage[];
      contextWindow: ContextWindowMetadata;
    }
  | {
      ok: false;
      error: {
        code: 'INVALID_PROMPT_SIZE';
        message: string;
        recoverable: false;
      };
    };

export function protectContext({
  systemMessage,
  historicalTurns,
  auxiliaryMessages,
  currentPrompt,
  currentOrdinal,
  context,
  thresholdRatio,
}: ProtectContextInput): ProtectedContext {
  const remainingTurns = [...historicalTurns];
  let auxiliary = [...auxiliaryMessages];
  let removedTurns = false;
  let truncatedAuxiliary = false;
  const threshold = context.limitTokens * thresholdRatio;
  const compose = (): LlmMessage[] => [
    systemMessage,
    ...remainingTurns.flatMap(({ messages }) => messages),
    ...auxiliary,
    currentPrompt,
  ];

  let messages = compose();
  let fits = context.measureInputTokens(messages).tokens <= threshold;

  while (!fits && remainingTurns.length > 0) {
    remainingTurns.shift();
    removedTurns = true;
    messages = compose();
    fits = context.measureInputTokens(messages).tokens <= threshold;
  }

  if (!fits && auxiliary.length > 0) {
    auxiliary = auxiliary.map(message => {
      const labelEnd = message.content.indexOf('\n');
      const label = labelEnd >= 0 ? message.content.slice(0, labelEnd + 1) : '';
      return { ...message, content: `${label}${CONTEXT_TRUNCATION_MARKER}` };
    });
    truncatedAuxiliary = true;
    messages = compose();
    fits = context.measureInputTokens(messages).tokens <= threshold;
  }

  if (!fits) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PROMPT_SIZE',
        message: 'The required prompt does not fit within the model context limit.',
        recoverable: false,
      },
    };
  }

  const protectionApplied = removedTurns
    ? truncatedAuxiliary
      ? 'turn-window-and-truncate'
      : 'turn-window'
    : truncatedAuxiliary
      ? 'truncate'
      : 'none';

  return {
    ok: true,
    messages,
    contextWindow: {
      truncated: removedTurns || truncatedAuxiliary,
      firstIncludedOrdinal: remainingTurns[0]?.ordinal ?? currentOrdinal,
      lastIncludedOrdinal: currentOrdinal,
      protectionApplied,
    },
  };
}
