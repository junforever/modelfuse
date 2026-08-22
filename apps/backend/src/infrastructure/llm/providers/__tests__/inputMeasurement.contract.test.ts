import { describe, expect, it } from 'vitest';

import { GoogleProvider } from '../GoogleProvider.js';
import { MiniMaxProvider } from '../MiniMaxProvider.js';
import { OpenAiProvider } from '../OpenAiProvider.js';
import { OpenRouterProvider } from '../OpenRouterProvider.js';
import { QwenProvider } from '../QwenProvider.js';
import { adapterConfig, deployment } from './providerContract.js';

const corpus = [
  { role: 'system' as const, content: 'ASCII system instruction.' },
  { role: 'user' as const, content: 'Dense punctuation: !?.,;:()[]{}<>|/\\---___' },
  { role: 'assistant' as const, content: 'Unicode café; emoji 👩‍💻🚀.' },
  { role: 'user' as const, content: '中文 العربية हिन्दी 日本語' },
  { role: 'assistant' as const, content: 'fragment-1|fragment-2\n---\n<END>' },
];

describe('provider input measurement contract', () => {
  it('measures snapshot-specific payload upper bounds deterministically for all five adapters', async () => {
    const providerCases = [
      { providerId: 'openai' as const, provider: new OpenAiProvider(adapterConfig) },
      { providerId: 'google' as const, provider: new GoogleProvider(adapterConfig) },
      { providerId: 'minimax' as const, provider: new MiniMaxProvider(adapterConfig) },
      { providerId: 'qwen' as const, provider: new QwenProvider(adapterConfig) },
      { providerId: 'openrouter' as const, provider: new OpenRouterProvider(adapterConfig) },
    ];
    const contentBytes = corpus.reduce(
      (total, message) => total + new TextEncoder().encode(message.content).length,
      0
    );

    const measurements = await Promise.all(
      providerCases.map(async ({ providerId, provider }) => {
        const snapshot = deployment(providerId);
        const measured = await provider.measureInputTokens(snapshot, corpus);
        const longerModelMeasurement = await provider.measureInputTokens(
          { ...snapshot, modelId: `${snapshot.modelId}-with-longer-snapshot-id` },
          corpus
        );

        expect(measured).toBeGreaterThanOrEqual(contentBytes);
        expect(Number.isSafeInteger(measured)).toBe(true);
        expect(longerModelMeasurement).toBeGreaterThan(measured);

        return measured;
      })
    );

    expect(measurements).toHaveLength(5);
  });
});
