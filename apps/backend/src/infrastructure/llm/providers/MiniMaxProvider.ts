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

interface MiniMaxResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class MiniMaxProvider implements LlmProvider {
  readonly providerId = 'minimax' as const;

  constructor(private readonly config: LlmProviderConfig) {}

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
      this.config.endpoint,
      this.config.timeoutMs,
      request
    );
    logProviderRequestStarted(trace);
    let data: MiniMaxResponse;
    try {
      const response = await axios.request<MiniMaxResponse>({
        method: 'POST',
        url: this.config.endpoint,
        timeout: this.config.timeoutMs,
        signal: request.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        data: {
          model: request.deployment.modelId,
          messages: request.messages,
          max_completion_tokens: request.deployment.maxOutputTokens,
        },
      });
      data = response.data;
      logProviderRequestCompleted(trace, Date.now() - requestStartedAt, response.status);
    } catch (error) {
      logProviderRequestFailed(trace, Date.now() - requestStartedAt, error);
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
    if (status === 401 || status === 403) return 'authentication';
    if (status === 429) return 'rate_limited';
    if (status === 413) return 'invalid_prompt_size';
    const body = error.response?.data as { base_resp?: { status_code?: unknown } } | undefined;
    if (body?.base_resp?.status_code === 1027) return 'content_blocked';
    return status >= 500 ? 'provider_transient_error' : 'provider_error';
  }

  private failure(code: LlmErrorCode, model: string): LlmProviderError {
    return {
      code,
      safeMessage: 'MiniMax request failed.',
      provider: this.providerId,
      model,
      recoverable: isRecoverableLlmError(code),
    };
  }
}
