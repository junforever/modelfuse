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

interface GoogleResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GoogleProvider implements LlmProvider {
  readonly providerId = 'google' as const;

  constructor(private readonly config: LlmProviderConfig) {}

  async measureInputTokens(
    deployment: LlmRequest['deployment'],
    messages: readonly LlmMessage[]
  ): Promise<number> {
    return new TextEncoder().encode(
      JSON.stringify({ model: deployment.modelId, ...this.mapMessages(messages) })
    ).length;
  }

  async generate(request: LlmRequest): Promise<LlmResult> {
    const startedAt = new Date().toISOString();
    const requestStartedAt = Date.now();
    const url = `${this.config.endpoint}/v1beta/models/${encodeURIComponent(request.deployment.modelId)}:generateContent`;
    const trace = createProviderRequestTrace(
      this.providerId,
      url,
      this.config.timeoutMs,
      request
    );
    logProviderRequestStarted(trace);
    let data: GoogleResponse;
    try {
      const response = await axios.request<GoogleResponse>({
        method: 'POST',
        url,
        timeout: this.config.timeoutMs,
        signal: request.signal,
        params: { key: this.config.apiKey },
        data: {
          ...this.mapMessages(request.messages),
          generationConfig: { maxOutputTokens: request.deployment.maxOutputTokens },
        },
      });
      data = response.data;
      logProviderRequestCompleted(trace, Date.now() - requestStartedAt, response.status);
    } catch (error) {
      logProviderRequestFailed(trace, Date.now() - requestStartedAt, error);
      throw this.failure(this.classify(error), request.deployment.modelId);
    }
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== 'string' || content.trim() === '')
      throw this.failure('invalid_response', request.deployment.modelId);
    const usage = data.usageMetadata;
    const metrics: LlmMetrics | undefined = usage
      ? {
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
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

  private mapMessages(messages: readonly LlmMessage[]): Record<string, unknown> {
    const systemParts = messages
      .filter(({ role }) => role === 'system')
      .map(({ content }) => ({ text: content }));
    const contents = messages
      .filter(({ role }) => role !== 'system')
      .map(({ role, content }) => ({
        role: role === 'assistant' ? 'model' : 'user',
        parts: [{ text: content }],
      }));
    return {
      ...(systemParts.length ? { system_instruction: { parts: systemParts } } : {}),
      contents,
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
    const body = error.response?.data as { promptFeedback?: { blockReason?: unknown } } | undefined;
    if (body?.promptFeedback?.blockReason === 'SAFETY') return 'content_blocked';
    return status >= 500 ? 'provider_transient_error' : 'provider_error';
  }

  private failure(code: LlmErrorCode, model: string): LlmProviderError {
    return {
      code,
      safeMessage: 'Google request failed.',
      provider: this.providerId,
      model,
      recoverable: isRecoverableLlmError(code),
    };
  }
}
