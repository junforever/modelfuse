import axios from 'axios';

import { isRecoverableLlmError } from '../../../services/llm/llmErrors.js';
import type {
  LlmErrorCode,
  LlmMessage,
  LlmMetrics,
  LlmProvider,
  LlmProviderError,
  LlmRequest,
  LlmResult,
} from '../../../types/llm.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class OpenRouterProvider implements LlmProvider {
  readonly providerId = 'openrouter' as const;

  constructor(private readonly config: { readonly apiKey: string; readonly timeoutMs: number }) {}

  async measureInputTokens(
    deployment: LlmRequest['deployment'],
    messages: readonly LlmMessage[]
  ): Promise<number> {
    return new TextEncoder().encode(JSON.stringify({ model: deployment.modelId, messages })).length;
  }

  async generate(request: LlmRequest): Promise<LlmResult> {
    const startedAt = new Date().toISOString();
    let data: OpenRouterResponse;
    try {
      ({ data } = await axios.request<OpenRouterResponse>({
        method: 'POST',
        url: OPENROUTER_ENDPOINT,
        timeout: this.config.timeoutMs,
        signal: request.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          model: request.deployment.modelId,
          messages: request.messages,
          max_tokens: request.deployment.maxOutputTokens,
        },
      }));
    } catch (error) {
      throw this.failure(this.classify(error), request.deployment.modelId);
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '')
      throw this.failure('invalid_response', request.deployment.modelId);
    const metrics: LlmMetrics | undefined = data.usage
      ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;
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
    if (status === 401) return 'authentication';
    if (status === 429) return 'rate_limited';
    if (status === 408 || status === 502 || status === 503) return 'provider_transient_error';
    return 'provider_error';
  }

  private failure(code: LlmErrorCode, model: string): LlmProviderError {
    return {
      code,
      safeMessage: 'OpenRouter request failed.',
      provider: this.providerId,
      model,
      recoverable: isRecoverableLlmError(code),
    };
  }
}
