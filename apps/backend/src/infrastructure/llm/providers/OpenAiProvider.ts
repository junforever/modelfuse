import axios from 'axios';

import { isRecoverableLlmError } from '../../../services/llm/llmErrors.js';
import {
  createProviderRequestTrace,
  logProviderRequestCompleted,
  logProviderRequestFailed,
  logProviderRequestStarted,
} from './providerDiagnostics.js';
import type { WebCitation } from '../../../types/conversations.js';
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

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface OpenAiResponsesResponse {
  output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responsesEndpoint(chatCompletionsEndpoint: string): string {
  return chatCompletionsEndpoint.replace(
    /\/chat\/completions(?=\/?(?:[?#]|$))/,
    '/responses'
  );
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

function normalizeResponsesOutput(
  value: unknown
): { readonly content: string; readonly citations?: readonly WebCitation[] } | undefined {
  if (!Array.isArray(value)) return;

  const textParts: string[] = [];
  const citations: WebCitation[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      item.type !== 'message' ||
      item.role !== 'assistant' ||
      !Array.isArray(item.content)
    ) {
      continue;
    }
    for (const part of item.content) {
      if (!isRecord(part) || part.type !== 'output_text' || typeof part.text !== 'string') {
        continue;
      }
      textParts.push(part.text);
      if (!Array.isArray(part.annotations)) continue;
      for (const annotation of part.annotations) {
        if (!isRecord(annotation) || annotation.type !== 'url_citation') continue;
        const { url, title } = annotation;
        if (
          typeof url !== 'string' ||
          !isSafeHttpUrl(url) ||
          typeof title !== 'string' ||
          title.trim() === ''
        ) {
          continue;
        }
        citations.push({ url, title: title.trim() });
      }
    }
  }

  const content = textParts.join('\n').trim();
  if (content === '') return;
  return {
    content,
    ...(citations.length === 0 ? {} : { citations }),
  };
}

export class OpenAiProvider implements LlmProvider {
  readonly providerId = 'openai' as const;

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
    const useWebSearch = request.webSearchEnabled && request.deployment.supportsWebSearch;
    const endpoint = useWebSearch
      ? responsesEndpoint(this.config.endpoint)
      : this.config.endpoint;
    const trace = createProviderRequestTrace(
      this.providerId,
      endpoint,
      this.config.timeoutMs,
      request
    );
    logProviderRequestStarted(trace);
    let data: OpenAiChatResponse | OpenAiResponsesResponse;
    try {
      const response = await axios.request<OpenAiChatResponse | OpenAiResponsesResponse>({
        method: 'POST',
        url: endpoint,
        timeout: this.config.timeoutMs,
        signal: request.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        data: useWebSearch
          ? {
              model: request.deployment.modelId,
              input: request.messages,
              tools: [{ type: 'web_search' }],
              ...(request.deployment.maxOutputTokens === undefined
                ? {}
                : { max_output_tokens: request.deployment.maxOutputTokens }),
            }
          : {
              model: request.deployment.modelId,
              messages: request.messages,
              ...(request.deployment.maxOutputTokens === undefined
                ? {}
                : { max_completion_tokens: request.deployment.maxOutputTokens }),
            },
      });
      data = response.data;
      logProviderRequestCompleted(trace, Date.now() - requestStartedAt, response.status);
    } catch (error) {
      logProviderRequestFailed(trace, Date.now() - requestStartedAt, error);
      throw this.failure(this.classify(error), request.deployment.modelId);
    }

    if (useWebSearch) {
      const responsesData = data as OpenAiResponsesResponse;
      const normalized = normalizeResponsesOutput(responsesData.output);
      if (normalized === undefined) {
        throw this.failure('invalid_response', request.deployment.modelId);
      }
      const metrics: LlmMetrics | undefined = responsesData.usage
        ? {
            inputTokens: responsesData.usage.input_tokens,
            outputTokens: responsesData.usage.output_tokens,
            totalTokens: responsesData.usage.total_tokens,
          }
        : undefined;
      return {
        content: normalized.content,
        provider: this.providerId,
        model: request.deployment.modelId,
        startedAt,
        completedAt: new Date().toISOString(),
        ...(metrics ? { metrics } : {}),
        ...(normalized.citations === undefined ? {} : { citations: normalized.citations }),
      };
    }

    const chatData = data as OpenAiChatResponse;
    const content = chatData.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw this.failure('invalid_response', request.deployment.modelId);
    }
    const metrics: LlmMetrics | undefined = chatData.usage
      ? {
          inputTokens: chatData.usage.prompt_tokens,
          outputTokens: chatData.usage.completion_tokens,
          totalTokens: chatData.usage.total_tokens,
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
    const body = error.response?.data as { error?: { code?: unknown } } | undefined;
    if (body?.error?.code === 'content_filter') return 'content_blocked';
    return status >= 500 ? 'provider_transient_error' : 'provider_error';
  }

  private failure(code: LlmErrorCode, model: string): LlmProviderError {
    return {
      code,
      safeMessage: 'OpenAI request failed.',
      provider: this.providerId,
      model,
      recoverable: isRecoverableLlmError(code),
    };
  }
}
