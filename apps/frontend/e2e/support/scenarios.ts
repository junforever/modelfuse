export const E2E_FRONTEND_ORIGIN = 'http://127.0.0.1:3000';
export const E2E_BACKEND_ORIGIN = 'http://127.0.0.1:3001';
export const E2E_API_BASE_URL = `${E2E_BACKEND_ORIGIN}/api/v1`;

export const fakeModelResponses = [
  { slot: 'openai', provider: 'openai', model: 'fake-openai', content: 'OpenAI response' },
  { slot: 'google', provider: 'google', model: 'fake-google', content: 'Google response' },
  { slot: 'minimax', provider: 'minimax', model: 'fake-minimax', content: 'MiniMax response' },
  { slot: 'qwen', provider: 'qwen', model: 'fake-qwen', content: 'Qwen response' },
] as const;

export const fakeModelScenarios = {
  comparison: {
    marker: '[e2e:comparison]',
    prompt: '[e2e:comparison] Compare deterministic provider responses.',
  },
  retry: {
    marker: '[e2e:openai-fails-once]',
    prompt: '[e2e:openai-fails-once] Recover and reconsolidate this response.',
    initialQwenContent: 'Qwen partial response',
    recoveredOpenAiContent: 'OpenAI recovered response',
    reconsolidatedQwenContent: 'Qwen reconsolidated response',
  },
  continueWithout: {
    marker: '[e2e:openai-fails]',
    prompt: '[e2e:openai-fails] Continue without the unavailable response.',
  },
  continuationBusy: {
    marker: '[e2e:continuation-busy]',
    prompt: '[e2e:continuation-busy] Keep this follow-up active until explicitly released.',
  },
  contextProtection: {
    marker: '[e2e:context-protection]',
    prompt:
      '[e2e:context-protection] Use the bounded context safely. ' +
      'Preserve only the relevant recent details while answering this follow-up.',
  },
} as const;
