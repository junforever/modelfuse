import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenRouterProvider } from '../OpenRouterProvider.js';
import {
  adapterConfig,
  axiosError,
  deployment,
  messages,
  MODEL,
  runProviderContract,
} from './providerContract.js';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
const SECRET_UPSTREAM_METADATA = 'upstream-credit-detail-must-not-cross-boundary';
const ECONOMIC_FIELDS = ['billing', 'cost', 'credit', 'budget', 'currency', 'economic', 'price'];

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ request: mocks.request })),
    request: mocks.request,
    isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
  },
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
}));

runProviderContract({
  name: 'OpenRouter',
  providerId: 'openrouter',
  createProvider: config => new OpenRouterProvider(config),
  requestMock: mocks.request,
  successfulResponse: {
    choices: [{ message: { content: 'Normalized answer' } }],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
      cost: 0.42,
      currency: 'USD',
    },
    credits: SECRET_UPSTREAM_METADATA,
    billing: { budget: 99 },
    economic: { price: 0.42 },
  },
  successfulResponseWithoutMetrics: {
    choices: [{ message: { content: 'Normalized answer' } }],
  },
  assertMappedRequest: (request, deployment) => {
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      timeout: adapterConfig.timeoutMs,
      signal: expect.any(AbortSignal),
      headers: {
        Authorization: `Bearer ${adapterConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: deployment.modelId,
        messages,
        max_tokens: deployment.maxOutputTokens,
      },
    });
    expect(request).not.toHaveProperty('data.tools');
  },
  assertOutputLimitOmitted: request => {
    expect(request).not.toHaveProperty('data.max_tokens');
  },
  errorCases: [
    {
      expectedCode: 'connectivity',
      recoverable: true,
      upstream: axiosError(undefined, { code: 'ENETUNREACH' }),
    },
    {
      expectedCode: 'invalid_response',
      recoverable: false,
      successfulResponse: { choices: [] },
    },
  ],
});

const generationRequest = () => ({
  slot: 'base-3' as const,
  deployment: deployment('openrouter'),
  messages,
  webSearchEnabled: false,
  signal: new AbortController().signal,
});

function webSearchRequest(enabled: boolean) {
  return { ...generationRequest(), webSearchEnabled: enabled };
}

function rejectedResponse(status: number, data: unknown) {
  return axiosError(status, {
    message: 'Upstream policy refusal with billing and credit details',
    response: {
      status,
      headers: { 'x-upstream-budget': 'classified' },
      data,
    },
  });
}

function expectSafeFailure(
  failure: unknown,
  expectedCode:
    | 'authentication'
    | 'rate_limited'
    | 'provider_transient_error'
    | 'provider_error'
    | 'content_blocked',
  recoverable: boolean
): void {
  expect(failure).toEqual({
    code: expectedCode,
    safeMessage: 'OpenRouter request failed.',
    provider: 'openrouter',
    model: MODEL,
    recoverable,
  });
  const serialized = JSON.stringify(failure).toLowerCase();
  expect(serialized).not.toContain(SECRET_UPSTREAM_METADATA);
  for (const field of ECONOMIC_FIELDS) expect(serialized).not.toContain(field);
}

describe('OpenRouter web search contract', () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it('sends the official server tool only when web search is enabled and supported', async () => {
    mocks.request.mockResolvedValue({
      data: { choices: [{ message: { content: 'Normalized answer' } }] },
    });
    const provider = new OpenRouterProvider(adapterConfig);

    await provider.generate(webSearchRequest(false));
    await provider.generate(webSearchRequest(true));
    await provider.generate({
      ...webSearchRequest(true),
      deployment: deployment('openrouter', { supportsWebSearch: false }),
    });

    expect(mocks.request.mock.calls[0]?.[0]).not.toHaveProperty('data.tools');
    expect(mocks.request.mock.calls[1]?.[0]).toHaveProperty('data.tools', [
      { type: 'openrouter:web_search' },
    ]);
    expect(mocks.request.mock.calls[2]?.[0]).not.toHaveProperty('data.tools');
  });

  it('normalizes safe URL citations and excludes upstream-only annotation fields', async () => {
    mocks.request.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: 'Answer with a source.',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://example.com/research?id=42',
                    title: 'Primary research',
                    content: 'Untrusted upstream excerpt',
                    start_index: 0,
                    end_index: 20,
                  },
                },
              ],
            },
          },
        ],
      },
    });
    const provider = new OpenRouterProvider(adapterConfig);

    const result = await provider.generate(webSearchRequest(true));

    expect(result).toMatchObject({
      citations: [{ url: 'https://example.com/research?id=42', title: 'Primary research' }],
    });
    expect(JSON.stringify(result)).not.toContain('Untrusted upstream excerpt');
    expect(JSON.stringify(result)).not.toContain('start_index');
  });

  it('ignores credential-bearing URL citations while retaining safe citations', async () => {
    mocks.request.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: 'Answer with one safe citation.',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://example.com/safe-source',
                    title: 'Safe source',
                  },
                },
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://embedded-user@example.com/private',
                    title: 'Username-bearing source',
                  },
                },
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://embedded-user:embedded-password@example.com/private',
                    title: 'Password-bearing source',
                  },
                },
              ],
            },
          },
        ],
      },
    });
    const provider = new OpenRouterProvider(adapterConfig);

    const result = await provider.generate(webSearchRequest(true));

    expect(result.citations).toEqual([
      { url: 'https://example.com/safe-source', title: 'Safe source' },
    ]);
  });

  it('ignores malformed and unsafe URL citation annotations', async () => {
    mocks.request.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: 'Answer without usable citations.',
              annotations: [
                null,
                { type: 'other', url_citation: { url: 'https://example.com/ignored' } },
                { type: 'url_citation', url_citation: null },
                {
                  type: 'url_citation',
                  url_citation: { url: 'javascript:alert(1)', title: 'Unsafe' },
                },
                {
                  type: 'url_citation',
                  url_citation: { url: 'https://example.com/missing-title' },
                },
                {
                  type: 'url_citation',
                  url_citation: { url: 'https://example.com/wrong-title', title: 42 },
                },
              ],
            },
          },
        ],
      },
    });
    const provider = new OpenRouterProvider(adapterConfig);

    const result = await provider.generate(webSearchRequest(true));

    expect(result).not.toHaveProperty('citations');
  });
});

describe('OpenRouter closed structural error classification', () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it.each([
    { status: 401, expectedCode: 'authentication', recoverable: false },
    { status: 429, expectedCode: 'rate_limited', recoverable: true },
    { status: 408, expectedCode: 'provider_transient_error', recoverable: true },
    { status: 502, expectedCode: 'provider_transient_error', recoverable: true },
    { status: 503, expectedCode: 'provider_transient_error', recoverable: true },
    { status: 402, expectedCode: 'provider_error', recoverable: false },
    { status: 403, expectedCode: 'provider_error', recoverable: false },
  ] as const)(
    'maps HTTP $status to $expectedCode with a safe metadata-free failure',
    async ({ status, expectedCode, recoverable }) => {
      mocks.request.mockRejectedValueOnce(
        rejectedResponse(status, {
          error: {
            message: 'content_policy_violation refusal blocked by policy',
            metadata: { billing: SECRET_UPSTREAM_METADATA },
          },
          cost: 12,
          credits: 3,
          currency: 'USD',
        })
      );
      const provider = new OpenRouterProvider(adapterConfig);

      let failure: unknown;
      try {
        await provider.generate(generationRequest());
      } catch (error) {
        failure = error;
      }

      expectSafeFailure(failure, expectedCode, recoverable);
      expect(mocks.request).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    {
      name: 'exact content policy error type',
      status: 400,
      metadata: { error_type: 'content_policy_violation' },
      expectedCode: 'content_blocked',
    },
    {
      name: 'exact refusal error type',
      status: 400,
      metadata: { error_type: 'refusal' },
      expectedCode: 'content_blocked',
    },
    {
      name: 'non-empty 403 reasons array',
      status: 403,
      metadata: { reasons: ['policy'] },
      expectedCode: 'content_blocked',
    },
    {
      name: 'non-empty 403 patterns array',
      status: 403,
      metadata: { patterns: ['pattern'] },
      expectedCode: 'content_blocked',
    },
    {
      name: 'empty 403 arrays',
      status: 403,
      metadata: { reasons: [], patterns: [] },
      expectedCode: 'provider_error',
    },
    {
      name: 'invalid 403 array shapes',
      status: 403,
      metadata: { reasons: 'policy', patterns: { length: 1 } },
      expectedCode: 'provider_error',
    },
    {
      name: 'inexact error type',
      status: 403,
      metadata: { error_type: 'content_policy_violation ' },
      expectedCode: 'provider_error',
    },
    {
      name: 'non-403 structured arrays',
      status: 400,
      metadata: { reasons: ['policy'], patterns: ['pattern'] },
      expectedCode: 'provider_error',
    },
  ] as const)(
    'classifies $name only from the allowed exact structure',
    async ({ status, metadata, expectedCode }) => {
      mocks.request.mockRejectedValueOnce(
        rejectedResponse(status, {
          error: {
            message: 'content_policy_violation refusal blocked by policy',
            detail: 'content policy violation',
            description: 'refusal',
            code: 'policy_blocked',
            metadata: {
              ...metadata,
              billing: SECRET_UPSTREAM_METADATA,
              budget: 5,
            },
          },
        })
      );
      const provider = new OpenRouterProvider(adapterConfig);

      let failure: unknown;
      try {
        await provider.generate(generationRequest());
      } catch (error) {
        failure = error;
      }

      expectSafeFailure(failure, expectedCode, false);
      expect(mocks.request).toHaveBeenCalledTimes(1);
    }
  );
});
