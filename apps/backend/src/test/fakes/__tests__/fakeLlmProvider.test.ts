import { describe, expect, it } from 'vitest';

import { createConversationFixture } from '../../fixtures/conversationFixtures.js';
import { createFakeLlmProviders } from '../fakeLlmProvider.js';

describe('fake LLM providers', () => {
  it('returns deterministic results for all four slots and records independent call snapshots', async () => {
    const fixture = createConversationFixture();
    const providers = createFakeLlmProviders();
    const messages = [{ role: 'user' as const, content: fixture.turn.prompt }];
    const signal = new AbortController().signal;

    const results = await Promise.all(
      Object.values(providers).map((provider) =>
        provider.generate({
          operationId: `operation-${provider.slot}`,
          slot: provider.slot,
          messages,
          signal,
        }),
      ),
    );
    messages[0].content = 'mutated after calls';

    expect(results.map(({ provider, model, content }) => ({ provider, model, content }))).toEqual([
      {
        provider: 'openai-fake',
        model: 'openai-test-model',
        content: 'Deterministic base-1 response',
      },
      {
        provider: 'google-fake',
        model: 'google-test-model',
        content: 'Deterministic base-2 response',
      },
      {
        provider: 'minimax-fake',
        model: 'minimax-test-model',
        content: 'Deterministic base-3 response',
      },
      {
        provider: 'qwen-fake',
        model: 'qwen-test-model',
        content: 'Deterministic consolidator response',
      },
    ]);
    expect(Object.values(providers).map((provider) => provider.calls)).toEqual(
      Object.values(providers).map((provider) => [
        {
          operationId: `operation-${provider.slot}`,
          slot: provider.slot,
          messages: [{ role: 'user', content: fixture.turn.prompt }],
          signal,
        },
      ]),
    );
  });

  it('records the call and rejects with the configured controlled error', async () => {
    const controlledError = new Error('controlled provider failure');
    const provider = createFakeLlmProviders({ consolidator: { error: controlledError } }).consolidator;
    const request = {
      operationId: 'operation-error',
      slot: 'consolidator' as const,
      messages: [{ role: 'user' as const, content: 'trigger controlled error' }],
      signal: new AbortController().signal,
    };

    await expect(provider.generate(request)).rejects.toBe(controlledError);
    expect(provider.calls).toEqual([request]);
  });
});
