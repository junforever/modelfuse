import axios from 'axios';

import { isRecoverableLlmError } from '../../../services/llm/llmErrors.js';
import type {
  InputTokenMeasurement,
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
  readonly slot = 'google' as const;
  readonly provider = 'google';
  readonly model: string;
  readonly context;

  constructor(private readonly config: LlmProviderConfig) {
    this.model = config.model;
    this.context = {
      limitTokens: config.contextLimitTokens,
      measureInputTokens: (messages: LlmMessage[]) => this.measure(messages),
    };
  }

  async generate(request: LlmRequest): Promise<LlmResult> {
    const startedAt = new Date().toISOString();
    let data: GoogleResponse;

    try {
      ({ data } = await axios.request<GoogleResponse>({
        method: 'POST',
        url: this.config.endpoint,
        timeout: this.config.timeoutMs,
        signal: request.signal,
        params: { key: this.config.apiKey },
        data: this.mapMessages(request.messages),
      }));
    } catch (error) {
      throw this.failure(this.classify(error));
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== 'string' || content.trim() === '') {
      throw this.failure('invalid_response');
    }

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
      provider: this.provider,
      model: this.model,
      startedAt,
      completedAt: new Date().toISOString(),
      ...(metrics ? { metrics } : {}),
    };
  }

  private mapMessages(messages: LlmMessage[]): Record<string, unknown> {
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
      ...(systemParts.length > 0
        ? { system_instruction: { parts: systemParts } }
        : {}),
      contents,
    };
  }

  private measure(messages: LlmMessage[]): InputTokenMeasurement {
    const bytes = new TextEncoder().encode(
      JSON.stringify(this.mapMessages(messages)),
    ).length;
    return {
      kind: 'upper_bound',
      tokens: bytes,
      basis: 'google deployment JSON UTF-8 byte upper bound',
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

    const body = error.response?.data as
      | { promptFeedback?: { blockReason?: unknown } }
      | undefined;
    if (body?.promptFeedback?.blockReason === 'SAFETY') return 'content_blocked';
    if (status >= 500) return 'provider_transient_error';
    return 'provider_error';
  }

  private failure(code: LlmErrorCode): LlmProviderError {
    return {
      code,
      safeMessage: 'Google request failed.',
      provider: this.provider,
      model: this.model,
      recoverable: isRecoverableLlmError(code),
    };
  }
}
