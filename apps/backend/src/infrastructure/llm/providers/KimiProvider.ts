import axios from 'axios';

import { isRecoverableLlmError } from '../../../services/llm/llmErrors.js';
import {
  createProviderRequestTrace,
  logProviderRequestCompleted,
  logProviderRequestFailed,
  logProviderRequestStarted,
} from './providerDiagnostics.js';
import type {
  LlmErrorCode,
  LlmMessage,
  LlmMetrics,
  LlmProvider,
  LlmProviderConfig,
  LlmProviderError,
  LlmRequest,
  LlmResult,
} from '../../../types/llm.js';

const KIMI_ENDPOINT = 'https://api.moonshot.ai/v1/chat/completions';
const WEB_SEARCH_TOOLS = [
  { type: 'builtin_function', function: { name: '$web_search' } },
] as const;

interface KimiMessage {
  content?: unknown;
  role?: unknown;
  tool_calls?: unknown;
}

interface KimiResponse {
  choices?: Array<{ finish_reason?: unknown; message?: KimiMessage }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidJson(value: string): boolean {
  if (value.trim() === '') return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function hasToolCalls(data: KimiResponse): boolean {
  const choice = data.choices?.[0];
  return (
    choice?.finish_reason === 'tool_calls' ||
    (Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0)
  );
}

function continuationMessages(
  originalMessages: readonly LlmMessage[],
  message: KimiMessage | undefined
): unknown[] | undefined {
  if (!isRecord(message) || message.role !== 'assistant' || !Array.isArray(message.tool_calls)) {
    return;
  }

  const toolMessages = message.tool_calls.flatMap(toolCall => {
    if (
      !isRecord(toolCall) ||
      typeof toolCall.id !== 'string' ||
      toolCall.id === '' ||
      toolCall.type !== 'function' ||
      !isRecord(toolCall.function) ||
      toolCall.function.name !== '$web_search' ||
      typeof toolCall.function.arguments !== 'string' ||
      !isValidJson(toolCall.function.arguments)
    ) {
      return [];
    }
    return [
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolCall.function.arguments,
      },
    ];
  });
  if (toolMessages.length !== message.tool_calls.length || toolMessages.length === 0) return;
  return [...originalMessages, message, ...toolMessages];
}

function aggregateUsage(usages: readonly (KimiResponse['usage'])[]): LlmMetrics | undefined {
  function sum(key: keyof NonNullable<KimiResponse['usage']>): number | undefined {
    const values = usages.flatMap(usage => {
      const value = usage?.[key];
      return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
    });
    return values.length === 0 ? undefined : values.reduce((total, value) => total + value, 0);
  }

  const inputTokens = sum('prompt_tokens');
  const outputTokens = sum('completion_tokens');
  const totalTokens = sum('total_tokens');
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

export class KimiProvider implements LlmProvider {
  readonly providerId = 'kimi' as const;

  constructor(
    private readonly config: Pick<LlmProviderConfig, 'apiKey' | 'timeoutMs'>
  ) {}

  async measureInputTokens(
    deployment: LlmRequest['deployment'],
    messages: readonly LlmMessage[]
  ): Promise<number> {
    return new TextEncoder().encode(JSON.stringify({ model: deployment.modelId, messages })).length;
  }

  async generate(request: LlmRequest): Promise<LlmResult> {
    const startedAt = new Date().toISOString();
    const requestStartedAt = Date.now();
    const trace = createProviderRequestTrace(
      this.providerId,
      KIMI_ENDPOINT,
      this.config.timeoutMs,
      request
    );
    logProviderRequestStarted(trace);

    const baseData = {
      model: request.deployment.modelId,
      ...(request.deployment.maxOutputTokens === undefined
        ? {}
        : { max_completion_tokens: request.deployment.maxOutputTokens }),
    };
    const useWebSearch = request.webSearchEnabled && request.deployment.supportsWebSearch;

    let data: KimiResponse;
    try {
      const response = await axios.request<KimiResponse>({
        method: 'POST',
        url: KIMI_ENDPOINT,
        timeout: this.config.timeoutMs,
        signal: request.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        data: {
          ...baseData,
          messages: request.messages,
          ...(useWebSearch ? { tools: WEB_SEARCH_TOOLS } : {}),
        },
      });
      data = response.data;
      logProviderRequestCompleted(trace, Date.now() - requestStartedAt, response.status);
    } catch (error) {
      logProviderRequestFailed(trace, Date.now() - requestStartedAt, error);
      throw this.failure(this.classify(error), request.deployment.modelId);
    }
    const usages: Array<KimiResponse['usage']> = [data.usage];

    if (useWebSearch && hasToolCalls(data)) {
      const messages = continuationMessages(request.messages, data.choices?.[0]?.message);
      if (messages === undefined) {
        throw this.failure('invalid_response', request.deployment.modelId);
      }

      try {
        const response = await axios.request<KimiResponse>({
          method: 'POST',
          url: KIMI_ENDPOINT,
          timeout: this.config.timeoutMs,
          signal: request.signal,
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          data: { ...baseData, messages },
        });
        data = response.data;
        usages.push(data.usage);
        logProviderRequestCompleted(trace, Date.now() - requestStartedAt, response.status);
      } catch (error) {
        logProviderRequestFailed(trace, Date.now() - requestStartedAt, error);
        throw this.failure(this.classify(error), request.deployment.modelId);
      }

      if (hasToolCalls(data)) {
        throw this.failure('invalid_response', request.deployment.modelId);
      }
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw this.failure('invalid_response', request.deployment.modelId);
    }

    const metrics = aggregateUsage(usages);

    return {
      content: content.trim(),
      provider: this.providerId,
      model: request.deployment.modelId,
      startedAt,
      completedAt: new Date().toISOString(),
      ...(metrics ? { metrics } : {}),
    };
  }

  private classify(error: unknown): LlmErrorCode {
    if (!axios.isAxiosError(error)) return 'provider_error';
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'timeout';
    const status = error.response?.status;
    if (status === undefined) return 'connectivity';
    if (status === 401 || status === 403) return 'authentication';
    if (status === 429) return 'rate_limited';
    if (status === 413) return 'invalid_prompt_size';
    const body = error.response?.data as { error?: { code?: unknown } } | undefined;
    if (body?.error?.code === 'content_filter') return 'content_blocked';
    return status >= 500 ? 'provider_transient_error' : 'provider_error';
  }

  private failure(code: LlmErrorCode, model: string): LlmProviderError {
    return {
      code,
      safeMessage: 'Kimi request failed.',
      provider: this.providerId,
      model,
      recoverable: isRecoverableLlmError(code),
    };
  }
}
