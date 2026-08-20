import { describe, expect, it } from 'vitest';

import { RESPONSE_SLOTS } from '../../../types/conversations.js';
import { createProviderRegistry } from '../providerRegistry.js';
import { GoogleProvider } from '../providers/GoogleProvider.js';
import { MiniMaxProvider } from '../providers/MiniMaxProvider.js';
import { OpenAiProvider } from '../providers/OpenAiProvider.js';
import { OpenRouterProvider } from '../providers/OpenRouterProvider.js';
import { QwenProvider } from '../providers/QwenProvider.js';

const environment = {
  OPENAI_API_KEY: 'openai-test-key',
  OPENAI_BASE_URL: undefined,
  GOOGLE_API_KEY: 'google-test-key',
  GOOGLE_BASE_URL: undefined,
  MINIMAX_API_KEY: 'minimax-test-key',
  MINIMAX_BASE_URL: undefined,
  QWEN_API_KEY: 'qwen-test-key',
  QWEN_BASE_URL: undefined,
  OPENROUTER_API_KEY: 'openrouter-test-key',
  LLM_PROVIDER_TIMEOUT_MS: 1_000,
};

describe('createProviderRegistry', () => {
  it('keeps canonical slots separate from credential-backed provider adapters', () => {
    const registry = createProviderRegistry(environment);

    expect(RESPONSE_SLOTS).toEqual(['base-1', 'base-2', 'base-3', 'consolidator']);
    expect(Object.keys(registry)).toEqual(['openai', 'google', 'minimax', 'qwen', 'openrouter']);
    expect(registry.openai).toBeInstanceOf(OpenAiProvider);
    expect(registry.google).toBeInstanceOf(GoogleProvider);
    expect(registry.minimax).toBeInstanceOf(MiniMaxProvider);
    expect(registry.qwen).toBeInstanceOf(QwenProvider);
    expect(registry.openrouter).toBeInstanceOf(OpenRouterProvider);
    expect(Object.values(registry).map(provider => provider.providerId)).toEqual([
      'openai',
      'google',
      'minimax',
      'qwen',
      'openrouter',
    ]);

    expect(
      createProviderRegistry({
        ...environment,
        OPENAI_API_KEY: undefined,
        GOOGLE_API_KEY: undefined,
        MINIMAX_API_KEY: undefined,
        QWEN_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
      }),
    ).toEqual({});
  });
});
