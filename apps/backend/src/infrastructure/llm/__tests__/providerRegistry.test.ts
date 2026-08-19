import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GoogleProvider } from '../providers/GoogleProvider.js';
import { MiniMaxProvider } from '../providers/MiniMaxProvider.js';
import { OpenAiProvider } from '../providers/OpenAiProvider.js';
import { QwenProvider } from '../providers/QwenProvider.js';

const environment = {
  OPENAI_API_KEY: 'openai-test-key',
  OPENAI_MODEL: 'openai-test-model',
  GOOGLE_API_KEY: 'google-test-key',
  GOOGLE_MODEL: 'google-test-model',
  MINIMAX_API_KEY: 'minimax-test-key',
  MINIMAX_MODEL: 'minimax-test-model',
  QWEN_API_KEY: 'qwen-test-key',
  QWEN_MODEL: 'qwen-test-model',
  LLM_PROVIDER_TIMEOUT_MS: '1000',
  CONVERSATION_CONTEXT_MAX_TURNS: '3',
  LLM_CONTEXT_THRESHOLD_RATIO: '0.8',
  OPENAI_CONTEXT_LIMIT_TOKENS: '1000',
  GOOGLE_CONTEXT_LIMIT_TOKENS: '1000',
  MINIMAX_CONTEXT_LIMIT_TOKENS: '1000',
  QWEN_CONTEXT_LIMIT_TOKENS: '1000',
  CONVERSATION_SIDEBAR_PAGE_SIZE: '20',
};

describe('providerRegistry', () => {
  beforeAll(() => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  });

  afterAll(() => vi.unstubAllEnvs());

  it('exports one literal adapter instance for each canonical slot instead of a factory', async () => {
    const { providerRegistry } = await import('../providerRegistry.js');

    expect(typeof providerRegistry).toBe('object');
    expect(Object.keys(providerRegistry)).toEqual(['openai', 'google', 'minimax', 'qwen']);
    expect(providerRegistry.openai).toBeInstanceOf(OpenAiProvider);
    expect(providerRegistry.google).toBeInstanceOf(GoogleProvider);
    expect(providerRegistry.minimax).toBeInstanceOf(MiniMaxProvider);
    expect(providerRegistry.qwen).toBeInstanceOf(QwenProvider);
    expect(Object.values(providerRegistry).map(({ slot }) => slot)).toEqual([
      'openai',
      'google',
      'minimax',
      'qwen',
    ]);
  });
});
