import type { ResponseSlot } from '../../types/conversations.js';
import type { LlmProvider, LlmRequest, LlmResult } from '../../types/llm.js';

export type ControlledProviderCall = LlmRequest;

type Script =
  { result: LlmResult } | { error: unknown } | { waitFor: Promise<void>; result: LlmResult };

const FIXED_START = '2026-01-02T03:04:05.000Z';
const FIXED_END = '2026-01-02T03:04:06.000Z';

export class ControlledLlmProvider implements LlmProvider {
  readonly calls: ControlledProviderCall[] = [];
  readonly provider: string;
  readonly model: string;
  readonly context = {
    limitTokens: 10_000,
    measureInputTokens: () => ({ kind: 'exact' as const, tokens: 1 }),
  };

  constructor(
    readonly slot: ResponseSlot,
    private readonly scripts: Script[] = []
  ) {
    this.provider = `${slot}-fake`;
    this.model = `${slot}-test-model`;
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

export function createControlledProviders(): Record<ResponseSlot, ControlledLlmProvider> {
  return {
    openai: new ControlledLlmProvider('openai'),
    google: new ControlledLlmProvider('google'),
    minimax: new ControlledLlmProvider('minimax'),
    qwen: new ControlledLlmProvider('qwen'),
  };
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
