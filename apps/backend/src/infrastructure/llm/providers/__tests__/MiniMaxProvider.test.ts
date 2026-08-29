import { expect, vi } from 'vitest';

import { MiniMaxProvider } from '../MiniMaxProvider.js';
import { adapterConfig, axiosError, messages, runProviderContract } from './providerContract.js';

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
  name: 'MiniMax',
  providerId: 'minimax',
  createProvider: config => new MiniMaxProvider(config),
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
      upstream: axiosError(undefined, { code: 'ECONNRESET' }),
    },
    {
      expectedCode: 'content_blocked',
      recoverable: false,
      upstream: axiosError(400, {
        response: { status: 400, data: { base_resp: { status_code: 1027 } } },
      }),
    },
    { expectedCode: 'invalid_prompt_size', recoverable: false, upstream: axiosError(413) },
    { expectedCode: 'invalid_response', recoverable: false, successfulResponse: { choices: [] } },
    { expectedCode: 'provider_transient_error', recoverable: true, upstream: axiosError(502) },
  ],
});
