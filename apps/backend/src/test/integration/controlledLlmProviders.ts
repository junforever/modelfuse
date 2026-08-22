import type {
  ConversationDeploymentSnapshot,
  ProviderId,
  ResponseSlot,
} from '../../types/conversations.js';
import type { LlmProvider, LlmRequest, LlmResult } from '../../types/llm.js';

export type ControlledProviderCall = LlmRequest;

type Script =
  { result: LlmResult } | { error: unknown } | { waitFor: Promise<void>; result: LlmResult };

const FIXED_START = '2026-01-02T03:04:05.000Z';
const FIXED_END = '2026-01-02T03:04:06.000Z';
const IDENTITIES: Record<
  ResponseSlot,
  { providerId: ProviderId; provider: string; model: string }
> = {
  'base-1': { providerId: 'openai', provider: 'openai-fake', model: 'openai-test-model' },
  'base-2': { providerId: 'google', provider: 'google-fake', model: 'google-test-model' },
  'base-3': { providerId: 'minimax', provider: 'minimax-fake', model: 'minimax-test-model' },
  consolidator: { providerId: 'qwen', provider: 'qwen-fake', model: 'qwen-test-model' },
};

interface ControlledProviderIdentity {
  readonly providerId: ProviderId;
  readonly provider: string;
  readonly model: string;
}

export class ControlledLlmProvider implements LlmProvider {
  readonly calls: ControlledProviderCall[] = [];
  readonly providerId: ProviderId;
  readonly provider: string;
  readonly model: string;
  readonly context = {
    limitTokens: 10_000,
    measureInputTokens: () => ({ kind: 'exact' as const, tokens: 1 }),
  };

  constructor(
    readonly slot: ResponseSlot,
    private readonly scripts: Script[] = [],
    identityOverride?: ControlledProviderIdentity
  ) {
    const identity = identityOverride ?? IDENTITIES[slot];
    this.providerId = identity.providerId;
    this.provider = identity.provider;
    this.model = identity.model;
  }

  async measureInputTokens(
    _deployment: ConversationDeploymentSnapshot,
    _messages: LlmRequest['messages']
  ): Promise<number> {
    return 1;
  }

  waitUntilCalled(count = 1): Promise<void> {
    if (this.calls.length >= count) return Promise.resolve();

    return new Promise(resolve => {
      const check = () => {
        if (this.calls.length >= count) resolve();
        else this.callWaiters.push(check);
      };
      this.callWaiters.push(check);
    });
  }

  enqueueResult(content = `Deterministic ${this.slot} response`): void {
    this.scripts.push({ result: this.result(content) });
  }

  enqueueBlocked(waitFor: Promise<void>, content = `Deterministic ${this.slot} response`): void {
    this.scripts.push({ waitFor, result: this.result(content) });
  }

  enqueueError(error: unknown): void {
    this.scripts.push({ error });
  }

  async generate(request: ControlledProviderCall): Promise<LlmResult> {
    this.calls.push({
      ...request,
      messages: request.messages.map(message => ({ ...message })),
    });
    for (const notify of this.callWaiters.splice(0)) notify();

    const script = this.scripts.shift() ?? { result: this.result() };
    if ('error' in script) throw script.error;
    if ('waitFor' in script) await script.waitFor;
    return { ...script.result };
  }

  private readonly callWaiters: Array<() => void> = [];

  private result(content = `Deterministic ${this.slot} response`): LlmResult {
    return {
      content,
      provider: this.provider,
      model: this.model,
      startedAt: FIXED_START,
      completedAt: FIXED_END,
    };
  }
}

export type ControlledProviders = Record<ResponseSlot, ControlledLlmProvider>;

export function createControlledProviders(): ControlledProviders {
  return {
    'base-1': new ControlledLlmProvider('base-1'),
    'base-2': new ControlledLlmProvider('base-2'),
    'base-3': new ControlledLlmProvider('base-3'),
    consolidator: new ControlledLlmProvider('consolidator'),
  };
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
