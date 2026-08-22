import { beforeEach, describe, expect, it, type Mock } from 'vitest';

type Slot = 'openai' | 'google' | 'minimax' | 'qwen';
type Role = 'system' | 'user' | 'assistant';

export type AdapterConfig = {
  apiKey: string;
  model: string;
  endpoint: string;
  timeoutMs: number;
  contextLimitTokens: number;
};

type Provider = {
  readonly slot: Slot;
  readonly provider: string;
  readonly model: string;
  generate(request: {
    operationId: string;
    slot: Slot;
    messages: Array<{ role: Role; content: string }>;
    signal: AbortSignal;
  }): Promise<{
    content: string;
    provider: string;
    model: string;
    startedAt: string;
    completedAt: string;
    metrics?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    metadata?: Record<string, string | number | boolean | null>;
  }>;
};

type ProviderConstructor = new (config: AdapterConfig) => Provider;

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

type ErrorCase = {
  expectedCode:
    | 'authentication'
    | 'rate_limited'
    | 'timeout'
    | 'connectivity'
    | 'content_blocked'
    | 'invalid_prompt_size'
    | 'invalid_response'
    | 'provider_transient_error'
    | 'provider_error';
  recoverable: boolean;
  upstream?: UpstreamError;
  successfulResponse?: unknown;
};

type ContractOptions = {
  name: string;
  slot: Slot;
  Provider: ProviderConstructor;
  requestMock: Mock;
  successfulResponse: unknown;
  assertMappedRequest: (request: Record<string, unknown>) => void;
  errorCases: ErrorCase[];
};

export const SECRET = 'provider-secret-must-not-leak';
export const SENSITIVE_UPSTREAM = 'sensitive-upstream-body';
export const MODEL = 'contract-test-model';

export const adapterConfig: AdapterConfig = {
  apiKey: SECRET,
  model: MODEL,
  endpoint: 'https://provider.invalid/v1/generate',
  timeoutMs: 2_500,
  contextLimitTokens: 8_192,
};

export const messages = [
  { role: 'system' as const, content: 'Answer concisely.' },
  { role: 'user' as const, content: 'First prompt' },
  { role: 'assistant' as const, content: 'Earlier answer' },
  { role: 'user' as const, content: 'Current prompt' },
];

export const request = (slot: Slot, signal = new AbortController().signal) => ({
  operationId: `operation-${slot}`,
  slot,
  messages,
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

    it('maps every message role and normalizes one successful upstream response', async () => {
      options.requestMock.mockResolvedValueOnce({ data: options.successfulResponse });
      const provider = new options.Provider(adapterConfig);

      const result = await provider.generate(request(options.slot));

      expect(options.requestMock).toHaveBeenCalledTimes(1);
      options.assertMappedRequest(
        options.requestMock.mock.calls[0]?.[0] as Record<string, unknown>
      );
      expect(provider).toMatchObject({
        slot: options.slot,
        provider: options.slot,
        model: MODEL,
      });
      expect(result).toMatchObject({
        content: 'Normalized answer',
        provider: options.slot,
        model: MODEL,
        metrics: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      });
      expect(Date.parse(result.startedAt)).not.toBeNaN();
      expect(Date.parse(result.completedAt)).not.toBeNaN();
      expect(Date.parse(result.completedAt)).toBeGreaterThanOrEqual(Date.parse(result.startedAt));
      expect(JSON.stringify(result.metadata ?? {})).not.toContain(SECRET);
      expect(JSON.stringify(result.metadata ?? {})).not.toContain('Normalized answer');
    });

    it('forwards AbortSignal and rejects promptly when the caller cancels', async () => {
      options.requestMock.mockImplementationOnce(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(axiosError(undefined, { code: 'ERR_CANCELED' })),
              { once: true }
            );
          })
      );
      const provider = new options.Provider(adapterConfig);
      const controller = new AbortController();

      const pending = provider.generate(request(options.slot, controller.signal));
      controller.abort();

      await expect(pending).rejects.toBeDefined();
      expect(options.requestMock).toHaveBeenCalledTimes(1);
      expect(options.requestMock.mock.calls[0]?.[0]).toMatchObject({
        signal: controller.signal,
      });
    });

    it('applies the complete canonical recoverability matrix without retrying or leaking upstream data', async () => {
      const provider = new options.Provider(adapterConfig);

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
          await provider.generate(request(options.slot));
        } catch (error) {
          failure = error;
        }

        expect(failure, errorCase.expectedCode).toMatchObject({
          code: errorCase.expectedCode,
          safeMessage: expect.any(String),
          provider: options.slot,
          model: MODEL,
          recoverable: errorCase.recoverable,
        });
        expect(Object.keys(failure as object).sort()).toEqual([
          'code',
          'model',
          'provider',
          'recoverable',
          'safeMessage',
        ]);
        expect(JSON.stringify(failure)).not.toContain(SECRET);
        expect(JSON.stringify(failure)).not.toContain(SENSITIVE_UPSTREAM);
        expect(options.requestMock).toHaveBeenCalledTimes(index + 1);
      }
    });
  });
}
