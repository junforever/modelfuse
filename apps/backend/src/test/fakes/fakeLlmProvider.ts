import type { ResponseSlot } from '../../types/conversations.js';

export interface FakeLlmRequest {
  operationId: string;
  slot: ResponseSlot;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  signal: AbortSignal;
}

export interface FakeLlmResult {
  content: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string;
}

interface FakeLlmProviderOptions {
  content?: string;
  error?: unknown;
}

const IDENTITIES: Record<ResponseSlot, { provider: string; model: string }> = {
  'base-1': { provider: 'openai-fake', model: 'openai-test-model' },
  'base-2': { provider: 'google-fake', model: 'google-test-model' },
  'base-3': { provider: 'minimax-fake', model: 'minimax-test-model' },
  consolidator: { provider: 'qwen-fake', model: 'qwen-test-model' },
};

const STARTED_AT = '2026-01-02T03:04:05.000Z';
const COMPLETED_AT = '2026-01-02T03:04:06.000Z';

export class FakeLlmProvider {
  readonly calls: FakeLlmRequest[] = [];
  readonly provider: string;
  readonly model: string;
  readonly context = {
    limitTokens: 10_000,
    measureInputTokens: () => ({ kind: 'exact' as const, tokens: 1 }),
  };

  private readonly result: FakeLlmResult;

  constructor(
    readonly slot: ResponseSlot,
    private readonly error?: unknown,
    content = `Deterministic ${slot} response`
  ) {
    const identity = IDENTITIES[slot];
    this.provider = identity.provider;
    this.model = identity.model;
    this.result = {
      content,
      provider: this.provider,
      model: this.model,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
    };
  }

  async generate(request: FakeLlmRequest): Promise<FakeLlmResult> {
    this.calls.push({
      ...request,
      messages: request.messages.map(message => ({ ...message })),
    });

    if (this.error !== undefined) {
      throw this.error;
    }

    return { ...this.result };
  }
}

export type FakeLlmProviders = Record<ResponseSlot, FakeLlmProvider>;

export function createFakeLlmProviders(
  overrides: Partial<Record<ResponseSlot, FakeLlmProviderOptions>> = {}
): FakeLlmProviders {
  return Object.fromEntries(
    (Object.keys(IDENTITIES) as ResponseSlot[]).map(slot => [
      slot,
      new FakeLlmProvider(slot, overrides[slot]?.error, overrides[slot]?.content),
    ])
  ) as FakeLlmProviders;
}
