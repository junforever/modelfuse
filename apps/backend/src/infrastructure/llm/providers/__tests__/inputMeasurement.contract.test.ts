import { describe, expect, it } from 'vitest';

import { GoogleProvider } from '../GoogleProvider.js';
import { MiniMaxProvider } from '../MiniMaxProvider.js';
import { OpenAiProvider } from '../OpenAiProvider.js';
import { QwenProvider } from '../QwenProvider.js';
import { adapterConfig } from './providerContract.js';

const corpus = [
  { role: 'system' as const, content: 'ASCII system instruction.' },
  { role: 'user' as const, content: 'Dense punctuation: !?.,;:()[]{}<>|/\\---___' },
  { role: 'assistant' as const, content: 'Unicode café; emoji 👩‍💻🚀.' },
  { role: 'user' as const, content: '中文 العربية हिन्दी 日本語' },
  { role: 'assistant' as const, content: 'fragment-1|fragment-2\n---\n<END>' },
];

describe('provider input measurement contract', () => {
  it('uses a provider-specific upper bound that covers corpus bytes, roles, and envelope overhead', () => {
    const providers = [
      new OpenAiProvider(adapterConfig),
      new GoogleProvider(adapterConfig),
      new MiniMaxProvider(adapterConfig),
      new QwenProvider(adapterConfig),
    ];
    const contentBytes = corpus.reduce(
      (total, message) => total + new TextEncoder().encode(message.content).length,
      0,
    );

    const measurements = providers.map((provider) => {
      const empty = provider.context.measureInputTokens([]);
      const oneRole = provider.context.measureInputTokens([
        { role: 'user', content: '' },
      ]);
      const allRoles = provider.context.measureInputTokens([
        { role: 'system', content: '' },
        { role: 'user', content: '' },
        { role: 'assistant', content: '' },
      ]);
      const measured = provider.context.measureInputTokens(corpus);

      expect(provider.context.limitTokens).toBe(adapterConfig.contextLimitTokens);
      expect(empty).toMatchObject({ kind: 'upper_bound', tokens: expect.any(Number) });
      expect(oneRole.tokens).toBeGreaterThan(empty.tokens);
      expect(allRoles.tokens).toBeGreaterThan(oneRole.tokens);
      expect(measured.tokens).toBeGreaterThanOrEqual(contentBytes);
      expect(Number.isSafeInteger(measured.tokens)).toBe(true);
      expect(measured).toMatchObject({
        kind: 'upper_bound',
        basis: expect.stringMatching(new RegExp(provider.slot, 'i')),
      });

      if (measured.kind !== 'upper_bound') {
        throw new Error(`${provider.slot} must expose its proven upper-bound basis`);
      }

      return measured;
    });

    expect(new Set(measurements.map((measurement) => measurement.basis)).size).toBe(4);
  });
});
