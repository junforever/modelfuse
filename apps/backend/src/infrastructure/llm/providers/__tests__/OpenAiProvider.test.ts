import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenAiProvider } from '../OpenAiProvider.js';
import {
  adapterConfig,
  axiosError,
  deployment,
  messages,
  runProviderContract,
} from './providerContract.js';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ request: mocks.request })),
    request: mocks.request,
    isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
  },
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
}));

runProviderContract({
  name: 'OpenAI',
  providerId: 'openai',
  createProvider: config => new OpenAiProvider(config),
  requestMock: mocks.request,
  successfulResponse: {
    choices: [{ message: { content: 'Normalized answer' } }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    upstreamMetadata: { billing: 'must-not-cross-boundary' },
  },
  successfulResponseWithoutMetrics: {
    choices: [{ message: { content: 'Normalized answer' } }],
  },
  assertMappedRequest: (request, deployment) => {
    expect(request).toMatchObject({
      method: 'POST',
      url: adapterConfig.endpoint,
      timeout: adapterConfig.timeoutMs,
      signal: expect.any(AbortSignal),
      headers: { Authorization: `Bearer ${adapterConfig.apiKey}` },
      data: {
        model: deployment.modelId,
        messages,
        max_completion_tokens: deployment.maxOutputTokens,
      },
    });
  },
  assertOutputLimitOmitted: request => {
    expect(request).not.toHaveProperty('data.max_completion_tokens');
  },
  errorCases: [
    { expectedCode: 'authentication', recoverable: false, upstream: axiosError(401) },
    { expectedCode: 'rate_limited', recoverable: true, upstream: axiosError(429) },
    {
      expectedCode: 'connectivity',
      recoverable: true,
      upstream: axiosError(undefined, { code: 'ECONNREFUSED' }),
    },
    {
      expectedCode: 'content_blocked',
      recoverable: false,
      upstream: axiosError(400, {
        response: { status: 400, data: { error: { code: 'content_filter' } } },
      }),
    },
    { expectedCode: 'invalid_prompt_size', recoverable: false, upstream: axiosError(413) },
    { expectedCode: 'invalid_response', recoverable: false, successfulResponse: { choices: [] } },
    { expectedCode: 'provider_transient_error', recoverable: true, upstream: axiosError(503) },
  ],
});

const chatCompletionsEndpoint = 'https://api.openai.com/v1/chat/completions';
const responsesEndpoint = 'https://api.openai.com/v1/responses';

function generationRequest(webSearchEnabled: boolean, supportsWebSearch = true) {
  return {
    slot: 'base-3' as const,
    deployment: deployment('openai', {
      deploymentId: 'openai-5.6-sol',
      modelId: 'gpt-5.6-sol',
      supportsWebSearch,
      maxOutputTokens: 123_457,
    }),
    messages,
    webSearchEnabled,
    signal: new AbortController().signal,
  };
}

describe('OpenAI web search contract', () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it('uses Responses for supported search requests and normalizes text, safe citations, and usage', async () => {
    mocks.request.mockResolvedValueOnce({
      status: 200,
      data: {
        output: [
          { type: 'web_search_call', id: 'search-call-1', status: 'completed' },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '  Current, sourced answer.  ',
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://example.com/current?id=42',
                    title: 'Current source',
                    start_index: 0,
                    end_index: 23,
                  },
                  {
                    type: 'url_citation',
                    url: 'https://embedded-user:password@example.com/private',
                    title: 'Credential-bearing source',
                  },
                  { type: 'url_citation', url: 'javascript:alert(1)', title: 'Unsafe source' },
                  { type: 'other', url: 'https://example.com/ignored', title: 'Ignored' },
                ],
              },
            ],
          },
        ],
        usage: { input_tokens: 19, output_tokens: 8, total_tokens: 27 },
      },
    });
    const provider = new OpenAiProvider({ ...adapterConfig, endpoint: chatCompletionsEndpoint });

    const result = await provider.generate(generationRequest(true));

    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      url: responsesEndpoint,
      timeout: adapterConfig.timeoutMs,
      signal: expect.any(AbortSignal),
      headers: { Authorization: `Bearer ${adapterConfig.apiKey}` },
      data: {
        model: 'gpt-5.6-sol',
        input: messages,
        tools: [{ type: 'web_search' }],
        max_output_tokens: 123_457,
      },
    });
    expect(mocks.request.mock.calls[0]?.[0]).not.toHaveProperty('data.messages');
    expect(result).toMatchObject({
      content: 'Current, sourced answer.',
      provider: 'openai',
      model: 'gpt-5.6-sol',
      metrics: { inputTokens: 19, outputTokens: 8, totalTokens: 27 },
      citations: [{ url: 'https://example.com/current?id=42', title: 'Current source' }],
    });
  });

  it('keeps false and unsupported search requests on Chat Completions without tools', async () => {
    mocks.request.mockResolvedValue({
      status: 200,
      data: { choices: [{ message: { content: 'Normalized answer' } }] },
    });
    const provider = new OpenAiProvider({ ...adapterConfig, endpoint: chatCompletionsEndpoint });

    await provider.generate(generationRequest(false));
    await provider.generate(generationRequest(true, false));

    expect(mocks.request).toHaveBeenCalledTimes(2);
    for (const request of mocks.request.mock.calls.map(([request]) => request)) {
      expect(request).toMatchObject({
        method: 'POST',
        url: chatCompletionsEndpoint,
        data: {
          model: 'gpt-5.6-sol',
          messages,
          max_completion_tokens: 123_457,
        },
      });
      expect(request).not.toHaveProperty('data.tools');
      expect(request).not.toHaveProperty('data.input');
    }
  });
});
