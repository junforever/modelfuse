import { expect, vi } from 'vitest';

import { QwenProvider } from '../QwenProvider.js';
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
  name: 'Qwen',
  providerId: 'qwen',
  createProvider: config => new QwenProvider(config),
  requestMock: mocks.request,
  successfulResponse: {
    output: { choices: [{ message: { content: 'Normalized answer' } }] },
    usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
    billing_metadata: { cost: 'must-not-cross-boundary' },
  },
  successfulResponseWithoutMetrics: {
    output: { choices: [{ message: { content: 'Normalized answer' } }] },
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
        input: { messages },
        parameters: {
          result_format: 'message',
          max_tokens: deployment.maxOutputTokens,
        },
      },
    });
  },
  assertOutputLimitOmitted: request => {
    expect(request).not.toHaveProperty('data.parameters.max_tokens');
  },
  errorCases: [
    { expectedCode: 'authentication', recoverable: false, upstream: axiosError(401) },
    { expectedCode: 'rate_limited', recoverable: true, upstream: axiosError(429) },
    {
      expectedCode: 'connectivity',
      recoverable: true,
      upstream: axiosError(undefined, { code: 'ENETUNREACH' }),
    },
    {
      expectedCode: 'content_blocked',
      recoverable: false,
      upstream: axiosError(400, {
        response: { status: 400, data: { code: 'DataInspectionFailed' } },
      }),
    },
    { expectedCode: 'invalid_prompt_size', recoverable: false, upstream: axiosError(413) },
    {
      expectedCode: 'invalid_response',
      recoverable: false,
      successfulResponse: { output: { choices: [] } },
    },
    { expectedCode: 'provider_transient_error', recoverable: true, upstream: axiosError(504) },
  ],
});
