import { expect, test } from './fixtures/modelFuse';

test('provides four deterministic model slots', async ({ fakeProviders }) => {
  expect(fakeProviders.map(provider => provider.slot)).toEqual([
    'openai',
    'google',
    'minimax',
    'qwen',
  ]);
  expect(fakeProviders.every(provider => provider.content.length > 0)).toBe(true);
});
