import { beforeEach, describe, expect, it, type Mock } from 'vitest';

import type {
  ConversationDeploymentSnapshot,
  ProviderId,
  ResponseSlot,
} from '../../../../types/conversations.js';
import type { LlmMessage, LlmProvider, LlmProviderConfig } from '../../../../types/llm.js';

type ErrorCase = {
  expectedCode:
    | 'authentication'
    | 'rate_limited'
    | 'connectivity'
    | 'content_blocked'
    | 'invalid_prompt_size'
    | 'invalid_response'
    | 'provider_transient_error';
  recoverable: boolean;
  upstream?: UpstreamError;
  successfulResponse?: unknown;
};

type ProviderRequest = {
  method: 'POST';
  url: string;
  timeout: number;
  signal: AbortSignal;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data: unknown;
};

type ContractOptions = {
  name: string;
  providerId: ProviderId;
  createProvider: (config: LlmProviderConfig) => LlmProvider;
  requestMock: Mock<(request: ProviderRequest) => Promise<{ data: unknown }>>;
  successfulResponse: unknown;
  successfulResponseWithoutMetrics: unknown;
  assertMappedRequest: (
    request: Record<string, unknown>,
    deployment: ConversationDeploymentSnapshot
  ) => void;
  assertOutputLimitOmitted: (request: Record<string, unknown>) => void;
  errorCases: ErrorCase[];
};

export type UpstreamError = {
  isAxiosError: true;
  code?: string;
  message: string;
  config?: { headers?: Record<string, string> };
  response?: {
    status: number;
    headers?: Record<string, string>;
    data?: unknown;
  };
};

export const SECRET = 'provider-secret-must-not-leak';
export const SENSITIVE_UPSTREAM = 'sensitive-upstream-body';
export const MODEL = 'snapshot-model/contract-test';
export const MAX_OUTPUT_TOKENS = 123_457;
export const REQUEST_SLOT: ResponseSlot = 'base-3';

export const adapterConfig: LlmProviderConfig = {
  apiKey: SECRET,
  endpoint: 'https://provider.invalid',
  timeoutMs: 2_500,
};

export const messages: readonly LlmMessage[] = [
  { role: 'system', content: 'Answer concisely.' },
  { role: 'user', content: 'First prompt' },
  { role: 'assistant', content: 'Earlier answer' },
  { role: 'user', content: 'Current prompt' },
];

export function deployment(
  providerId: ProviderId,
  overrides: Partial<ConversationDeploymentSnapshot> = {}
): ConversationDeploymentSnapshot {
  return {
    slot: REQUEST_SLOT,
    deploymentId: `deployment-${providerId}`,
    providerId,
    modelId: MODEL,
    displayName: `${providerId} contract deployment`,
    supportsWebSearch: providerId === 'openrouter',
    contextLimitTokens: 262_144,
    inputModalities: ['text'],
    outputModalities: ['text'],
    ...overrides,
  };
}

const generationRequest = (providerId: ProviderId, signal = new AbortController().signal) => ({
  slot: REQUEST_SLOT,
  deployment: deployment(providerId, { maxOutputTokens: MAX_OUTPUT_TOKENS }),
  messages,
  webSearchEnabled: false,
  signal,
});

export function axiosError(
  status: number | undefined,
  overrides: Partial<UpstreamError> = {}
): UpstreamError {
  return {
    isAxiosError: true,
    message: `${SENSITIVE_UPSTREAM}: ${SECRET}`,
    config: { headers: { Authorization: `Bearer ${SECRET}` } },
    ...(status === undefined
      ? {}
      : {
          response: {
            status,
            headers: { 'x-secret': SECRET },
            data: { detail: SENSITIVE_UPSTREAM },
          },
        }),
    ...overrides,
  };
}

export function runProviderContract(options: ContractOptions): void {
  describe(`${options.name} provider contract`, () => {
    beforeEach(() => {
      options.requestMock.mockReset();
    });

    it('uses an arbitrary canonical slot and sends the native output limit only when the snapshot defines it', async () => {
      options.requestMock.mockResolvedValueOnce({ data: options.successfulResponse });
      options.requestMock.mockResolvedValueOnce({ data: options.successfulResponse });
      const provider = options.createProvider(adapterConfig);
      const request = generationRequest(options.providerId);

      const result = await provider.generate(request);

      expect(provider.providerId).toBe(options.providerId);
      expect(request.slot).toBe(REQUEST_SLOT);
      expect(request.deployment.slot).toBe(REQUEST_SLOT);
      expect(options.requestMock).toHaveBeenCalledTimes(1);
      options.assertMappedRequest(options.requestMock.mock.calls[0][0], request.deployment);
      expect(result).toMatchObject({
        content: 'Normalized answer',
        provider: options.providerId,
        model: MODEL,
        metrics: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      });
      expect(Object.keys(result).sort()).toEqual([
        'completedAt',
        'content',
        'metrics',
        'model',
        'provider',
        'startedAt',
      ]);
      expect(Object.keys(result.metrics ?? {}).sort()).toEqual([
        'inputTokens',
        'outputTokens',
        'totalTokens',
      ]);
      expect(Date.parse(result.startedAt)).not.toBeNaN();
      expect(Date.parse(result.completedAt)).not.toBeNaN();
      expect(Date.parse(result.completedAt)).toBeGreaterThanOrEqual(Date.parse(result.startedAt));
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(JSON.stringify(result)).not.toContain(SENSITIVE_UPSTREAM);

      await provider.generate({
        ...request,
        deployment: deployment(options.providerId),
      });

      expect(options.requestMock).toHaveBeenCalledTimes(2);
      options.assertOutputLimitOmitted(options.requestMock.mock.calls[1][0]);
    });

    it('omits metrics when the upstream does not report usage', async () => {
      options.requestMock.mockResolvedValueOnce({
        data: options.successfulResponseWithoutMetrics,
      });
      const provider = options.createProvider(adapterConfig);

      const result = await provider.generate(generationRequest(options.providerId));

      expect(options.requestMock).toHaveBeenCalledTimes(1);
      expect(result).not.toHaveProperty('metrics');
      expect(result.content).toBe('Normalized answer');
    });

    it('forwards cancellation and normalizes both abort and timeout with one call per attempt', async () => {
      options.requestMock.mockImplementationOnce(
        ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(axiosError(undefined, { code: 'ERR_CANCELED' })),
              { once: true }
            );
          })
      );
      const provider = options.createProvider(adapterConfig);
      const controller = new AbortController();

      const aborted = provider.generate(generationRequest(options.providerId, controller.signal));
      controller.abort();

      await expect(aborted).rejects.toMatchObject({
        code: 'connectivity',
        recoverable: true,
        provider: options.providerId,
        model: MODEL,
      });
      expect(options.requestMock).toHaveBeenCalledTimes(1);
      expect(options.requestMock.mock.calls[0]?.[0]).toMatchObject({
        signal: controller.signal,
      });

      options.requestMock.mockRejectedValueOnce(axiosError(undefined, { code: 'ECONNABORTED' }));

      await expect(provider.generate(generationRequest(options.providerId))).rejects.toMatchObject({
        code: 'timeout',
        recoverable: true,
        provider: options.providerId,
        model: MODEL,
      });
      expect(options.requestMock).toHaveBeenCalledTimes(2);
    });

    it('normalizes common upstream failures into safe errors without retrying', async () => {
      const provider = options.createProvider(adapterConfig);

      for (const [index, errorCase] of options.errorCases.entries()) {
        if (errorCase.upstream) {
          options.requestMock.mockRejectedValueOnce(errorCase.upstream);
        } else {
          options.requestMock.mockResolvedValueOnce({
            data: errorCase.successfulResponse,
          });
        }

        let failure: unknown;
        try {
          await provider.generate(generationRequest(options.providerId));
        } catch (error) {
          failure = error;
        }

        expect(failure, errorCase.expectedCode).toEqual({
          code: errorCase.expectedCode,
          safeMessage: expect.any(String),
          provider: options.providerId,
          model: MODEL,
          recoverable: errorCase.recoverable,
        });
        expect(JSON.stringify(failure)).not.toContain(SECRET);
        expect(JSON.stringify(failure)).not.toContain(SENSITIVE_UPSTREAM);
        expect(options.requestMock).toHaveBeenCalledTimes(index + 1);
      }
    });

    it('keeps an output-limit rejection non-recoverable and does not reduce, negotiate, fall back, or retry', async () => {
      options.requestMock.mockRejectedValueOnce(axiosError(400));
      const provider = options.createProvider(adapterConfig);
      const request = generationRequest(options.providerId);

      await expect(provider.generate(request)).rejects.toEqual({
        code: 'provider_error',
        safeMessage: expect.any(String),
        provider: options.providerId,
        model: MODEL,
        recoverable: false,
      });

      expect(options.requestMock).toHaveBeenCalledTimes(1);
      options.assertMappedRequest(options.requestMock.mock.calls[0][0], request.deployment);
    });
  });
}
