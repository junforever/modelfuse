import { test as base, expect } from '@playwright/test';

export const fakeModelResponses = [
  { slot: 'openai', provider: 'openai', model: 'fake-openai', content: 'OpenAI response' },
  { slot: 'google', provider: 'google', model: 'fake-google', content: 'Google response' },
  { slot: 'minimax', provider: 'minimax', model: 'fake-minimax', content: 'MiniMax response' },
  { slot: 'qwen', provider: 'qwen', model: 'fake-qwen', content: 'Qwen response' },
] as const;

type ModelFuseFixtures = {
  fakeProviders: typeof fakeModelResponses;
};

export const test = base.extend<ModelFuseFixtures>({
  fakeProviders: async ({ browserName }, provide) => {
    void browserName;
    await provide(fakeModelResponses);
  },
});

export { expect };
