import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env.js';

const validEnv = {
  OPENAI_API_KEY: 'openai-secret',
  OPENAI_MODEL: 'openai-model',
  GOOGLE_API_KEY: 'google-secret',
  GOOGLE_MODEL: 'google-model',
  MINIMAX_API_KEY: 'minimax-secret',
  MINIMAX_MODEL: 'minimax-model',
  QWEN_API_KEY: 'qwen-secret',
  QWEN_MODEL: 'qwen-model',
  LLM_PROVIDER_TIMEOUT_MS: '30000',
  CONVERSATION_CONTEXT_MAX_TURNS: '8',
  OPENAI_CONTEXT_LIMIT_TOKENS: '128000',
  GOOGLE_CONTEXT_LIMIT_TOKENS: '1000000',
  MINIMAX_CONTEXT_LIMIT_TOKENS: '1000000',
  QWEN_CONTEXT_LIMIT_TOKENS: '131072',
  CONVERSATION_SIDEBAR_PAGE_SIZE: '20',
} satisfies NodeJS.ProcessEnv;

describe('parseEnv', () => {
  it('returns typed provider and technical configuration with the default context ratio', () => {
    const parsed = parseEnv(validEnv);

    expect(parsed).toMatchObject({
      OPENAI_API_KEY: 'openai-secret',
      OPENAI_MODEL: 'openai-model',
      GOOGLE_API_KEY: 'google-secret',
      GOOGLE_MODEL: 'google-model',
      MINIMAX_API_KEY: 'minimax-secret',
      MINIMAX_MODEL: 'minimax-model',
      QWEN_API_KEY: 'qwen-secret',
      QWEN_MODEL: 'qwen-model',
      LLM_PROVIDER_TIMEOUT_MS: 30000,
      CONVERSATION_CONTEXT_MAX_TURNS: 8,
      LLM_CONTEXT_THRESHOLD_RATIO: 0.8,
      OPENAI_CONTEXT_LIMIT_TOKENS: 128000,
      GOOGLE_CONTEXT_LIMIT_TOKENS: 1000000,
      MINIMAX_CONTEXT_LIMIT_TOKENS: 1000000,
      QWEN_CONTEXT_LIMIT_TOKENS: 131072,
      CONVERSATION_SIDEBAR_PAGE_SIZE: 20,
    });
  });

  it.each([
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'GOOGLE_API_KEY',
    'GOOGLE_MODEL',
    'MINIMAX_API_KEY',
    'MINIMAX_MODEL',
    'QWEN_API_KEY',
    'QWEN_MODEL',
  ] as const)('rejects missing required provider setting %s', (name) => {
    expect(() => parseEnv({ ...validEnv, [name]: '' })).toThrow(name);
  });

  it.each([
    ['LLM_PROVIDER_TIMEOUT_MS', '0'],
    ['CONVERSATION_CONTEXT_MAX_TURNS', '0'],
    ['CONVERSATION_CONTEXT_MAX_TURNS', '1.5'],
    ['CONVERSATION_SIDEBAR_PAGE_SIZE', '0'],
    ['CONVERSATION_SIDEBAR_PAGE_SIZE', '2.5'],
  ] as const)('rejects invalid positive integer configuration %s=%s', (name, value) => {
    expect(() => parseEnv({ ...validEnv, [name]: value })).toThrow(name);
  });

  it.each(['0', '-0.1', '1.01', 'not-a-number']) (
    'rejects context threshold ratio outside (0, 1]: %s',
    (value) => {
      expect(() =>
        parseEnv({ ...validEnv, LLM_CONTEXT_THRESHOLD_RATIO: value })
      ).toThrow('LLM_CONTEXT_THRESHOLD_RATIO');
    }
  );

  it.each([
    'OPENAI_CONTEXT_LIMIT_TOKENS',
    'GOOGLE_CONTEXT_LIMIT_TOKENS',
    'MINIMAX_CONTEXT_LIMIT_TOKENS',
    'QWEN_CONTEXT_LIMIT_TOKENS',
  ] as const)('rejects an invalid technical deployment limit in %s', (name) => {
    expect(() => parseEnv({ ...validEnv, [name]: '0' })).toThrow(name);
  });

  it('reports invalid variable names without exposing provider credentials', () => {
    const parseInvalidEnv = () =>
      parseEnv({
        ...validEnv,
        OPENAI_API_KEY: 'credential-that-must-not-leak',
        LLM_CONTEXT_THRESHOLD_RATIO: '2',
      });

    expect(parseInvalidEnv).toThrow('LLM_CONTEXT_THRESHOLD_RATIO');
    expect(parseInvalidEnv).not.toThrow('credential-that-must-not-leak');
  });
});
