import { expect, vi } from 'vitest';

import { GoogleProvider } from '../GoogleProvider.js';
import {
  adapterConfig,
  axiosError,
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
  name: 'Google',
  slot: 'google',
  Provider: GoogleProvider,
  requestMock: mocks.request,
  successfulResponse: {
    candidates: [{ content: { parts: [{ text: 'Normalized answer' }] } }],
    usageMetadata: {
      promptTokenCount: 11,
      candidatesTokenCount: 7,
      totalTokenCount: 18,
    },
  },
  assertMappedRequest: (request) => {
    expect(request).toMatchObject({
      method: 'POST',
      url: adapterConfig.endpoint,
      timeout: adapterConfig.timeoutMs,
      signal: expect.any(AbortSignal),
      params: { key: adapterConfig.apiKey },
      data: {
        system_instruction: { parts: [{ text: 'Answer concisely.' }] },
        contents: [
          { role: 'user', parts: [{ text: 'First prompt' }] },
          { role: 'model', parts: [{ text: 'Earlier answer' }] },
          { role: 'user', parts: [{ text: 'Current prompt' }] },
        ],
      },
    });
  },
  errorCases: [
    { expectedCode: 'authentication', recoverable: false, upstream: axiosError(401) },
    { expectedCode: 'rate_limited', recoverable: true, upstream: axiosError(429) },
    {
      expectedCode: 'timeout',
      recoverable: true,
      upstream: axiosError(undefined, { code: 'ECONNABORTED' }),
    },
    {
      expectedCode: 'connectivity',
      recoverable: true,
      upstream: axiosError(undefined, { code: 'ENOTFOUND' }),
    },
    {
      expectedCode: 'content_blocked',
      recoverable: false,
      upstream: axiosError(400, {
        response: { status: 400, data: { promptFeedback: { blockReason: 'SAFETY' } } },
      }),
    },
    { expectedCode: 'invalid_prompt_size', recoverable: false, upstream: axiosError(413) },
    { expectedCode: 'invalid_response', recoverable: false, successfulResponse: { candidates: [] } },
    { expectedCode: 'provider_transient_error', recoverable: true, upstream: axiosError(503) },
    { expectedCode: 'provider_error', recoverable: false, upstream: axiosError(400) },
  ],
});
