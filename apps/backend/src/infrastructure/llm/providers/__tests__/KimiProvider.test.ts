import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KimiProvider } from '../KimiProvider.js';
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
  name: 'Kimi',
  providerId: 'kimi',
  createProvider: config => new KimiProvider(config),
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
      url: 'https://api.moonshot.ai/v1/chat/completions',
      timeout: adapterConfig.timeoutMs,
      signal: expect.any(AbortSignal),
      headers: { Authorization: `Bearer ${adapterConfig.apiKey}` },
    });
    expect(request.data).toEqual({
      model: deployment.modelId,
      messages,
      max_completion_tokens: deployment.maxOutputTokens,
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

function generationRequest(webSearchEnabled: boolean, supportsWebSearch = true) {
  return {
    slot: 'base-3' as const,
    deployment: deployment('kimi', {
      deploymentId: 'kimi-k3',
      modelId: 'kimi-k3',
      supportsWebSearch,
      maxOutputTokens: 123_457,
    }),
    messages,
    webSearchEnabled,
    signal: new AbortController().signal,
  };
}

const webSearchTools = [
  { type: 'builtin_function', function: { name: '$web_search' } },
] as const;

const assistantToolCallMessage = {
  role: 'assistant',
  content: null,
  tool_calls: [
    {
      id: 'search-call-1',
      type: 'function',
      function: { name: '$web_search', arguments: '{"query":"current release"}' },
    },
    {
      id: 'search-call-2',
      type: 'function',
      function: { name: '$web_search', arguments: '{ "query": "current docs" }' },
    },
  ],
} as const;

function toolCallResponse() {
  return {
    status: 200,
    data: {
      choices: [{ finish_reason: 'tool_calls', message: assistantToolCallMessage }],
      usage: { prompt_tokens: 13, completion_tokens: 4, total_tokens: 17 },
    },
  };
}

function toolCallResponseWithArguments(argumentsText: string) {
  return {
    status: 200,
    data: {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'search-call-invalid',
                type: 'function',
                function: { name: '$web_search', arguments: argumentsText },
              },
            ],
          },
        },
      ],
    },
  };
}

describe('Kimi web search contract', () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it('declares $web_search, continues once with unchanged arguments, and normalizes the final response', async () => {
    mocks.request.mockResolvedValueOnce(toolCallResponse()).mockResolvedValueOnce({
      status: 200,
      data: {
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: '  Current, sourced answer.  ' },
          },
        ],
        usage: { prompt_tokens: 23, completion_tokens: 9, total_tokens: 32 },
      },
    });
    const provider = new KimiProvider(adapterConfig);

    const result = await provider.generate(generationRequest(true));

    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.moonshot.ai/v1/chat/completions',
      data: {
        model: 'kimi-k3',
        messages,
        tools: webSearchTools,
        max_completion_tokens: 123_457,
      },
    });
    expect(mocks.request.mock.calls[1]?.[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.moonshot.ai/v1/chat/completions',
      data: {
        model: 'kimi-k3',
        messages: [
          ...messages,
          assistantToolCallMessage,
          {
            role: 'tool',
            tool_call_id: 'search-call-1',
            content: '{"query":"current release"}',
          },
          {
            role: 'tool',
            tool_call_id: 'search-call-2',
            content: '{ "query": "current docs" }',
          },
        ],
        max_completion_tokens: 123_457,
      },
    });
    expect(result).toMatchObject({
      content: 'Current, sourced answer.',
      provider: 'kimi',
      model: 'kimi-k3',
      metrics: { inputTokens: 36, outputTokens: 13, totalTokens: 49 },
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['syntactically invalid JSON', '{"query":'],
  ])('rejects %s tool arguments without a continuation request', async (_name, argumentsText) => {
    mocks.request
      .mockResolvedValueOnce(toolCallResponseWithArguments(argumentsText))
      .mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [{ finish_reason: 'stop', message: { content: 'Must not be reached' } }],
        },
      });
    const provider = new KimiProvider(adapterConfig);

    let failure: unknown;
    try {
      await provider.generate(generationRequest(true));
    } catch (error) {
      failure = error;
    }

    expect.soft(failure).toEqual({
      code: 'invalid_response',
      safeMessage: 'Kimi request failed.',
      provider: 'kimi',
      model: 'kimi-k3',
      recoverable: false,
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('keeps false and unsupported search requests to one ordinary call without tools', async () => {
    mocks.request.mockResolvedValue({
      status: 200,
      data: {
        choices: [{ finish_reason: 'stop', message: { content: 'Normalized answer' } }],
      },
    });
    const provider = new KimiProvider(adapterConfig);

    await provider.generate(generationRequest(false));
    await provider.generate(generationRequest(true, false));

    expect(mocks.request).toHaveBeenCalledTimes(2);
    for (const request of mocks.request.mock.calls.map(([request]) => request)) {
      expect(request).toMatchObject({
        data: {
          model: 'kimi-k3',
          messages,
          max_completion_tokens: 123_457,
        },
      });
      expect(request).not.toHaveProperty('data.tools');
    }
  });

  it('rejects a second tool-call round as invalid instead of continuing again', async () => {
    mocks.request.mockResolvedValueOnce(toolCallResponse()).mockResolvedValueOnce(toolCallResponse());
    const provider = new KimiProvider(adapterConfig);

    await expect(provider.generate(generationRequest(true))).rejects.toEqual({
      code: 'invalid_response',
      safeMessage: 'Kimi request failed.',
      provider: 'kimi',
      model: 'kimi-k3',
      recoverable: false,
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
