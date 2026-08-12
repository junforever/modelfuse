import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env.js';

const validEnv = {
  PORT: '3001',
  NODE_ENV: 'development',
  FRONTEND_URL_LOCALHOST: 'http://localhost:5173',
  REQUEST_MAX_BODY_SIZE: '1mb',
  REQUEST_TIMEOUT: '15s',
  POSTGRES_USER: 'postgres',
  POSTGRES_PASSWORD: 'postgres-secret',
  POSTGRES_DB: 'modelfuse',
  POSTGRES_MAX_CONNECTIONS: '10',
  POSTGRES_IDLE_TIMEOUT: '30000',
  POSTGRES_CONNECTION_TIMEOUT: '2000',
  POSTGRES_KEEP_ALIVE: 'true',
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
  it('returns one typed runtime configuration with safe defaults', () => {
    const parsed = parseEnv(validEnv);

    expect(parsed).toMatchObject({
      PORT: 3001,
      NODE_ENV: 'development',
      FRONTEND_URL_LOCALHOST: 'http://localhost:5173',
      REQUEST_MAX_BODY_SIZE: '1mb',
      REQUEST_TIMEOUT: '15s',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres-secret',
      POSTGRES_DB: 'modelfuse',
      POSTGRES_MAX_CONNECTIONS: 10,
      POSTGRES_IDLE_TIMEOUT: 30000,
      POSTGRES_CONNECTION_TIMEOUT: 2000,
      POSTGRES_KEEP_ALIVE: true,
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

  it('selects a required HTTP(S) frontend origin for each runtime environment', () => {
    expect(() => parseEnv({ ...validEnv, FRONTEND_URL_LOCALHOST: '' })).toThrow(
      'FRONTEND_URL_LOCALHOST',
    );

    const production = {
      ...validEnv,
      NODE_ENV: 'production',
      FRONTEND_URL_LOCALHOST: '',
      FRONTEND_URL: 'https://app.example.test',
    };
    expect(parseEnv(production)).toMatchObject({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://app.example.test',
    });
    expect(() => parseEnv({ ...production, FRONTEND_URL: '' })).toThrow('FRONTEND_URL');
    expect(() =>
      parseEnv({ ...production, FRONTEND_URL: 'javascript:alert(1)' }),
    ).toThrow('FRONTEND_URL');
    expect(parseEnv({ ...validEnv, NODE_ENV: 'test' })).toMatchObject({
      NODE_ENV: 'test',
      FRONTEND_URL_LOCALHOST: 'http://localhost:5173',
    });
  });

  it.each([
    ['PORT', '-1'],
    ['PORT', '65536'],
    ['PORT', '1.5'],
    ['NODE_ENV', 'staging'],
    ['REQUEST_MAX_BODY_SIZE', undefined],
    ['REQUEST_MAX_BODY_SIZE', 'unbounded'],
    ['REQUEST_TIMEOUT', undefined],
    ['REQUEST_TIMEOUT', 'never'],
    ['POSTGRES_USER', undefined],
    ['POSTGRES_PASSWORD', undefined],
    ['POSTGRES_DB', undefined],
    ['POSTGRES_MAX_CONNECTIONS', '0'],
    ['POSTGRES_MAX_CONNECTIONS', '1.5'],
    ['POSTGRES_IDLE_TIMEOUT', '-1'],
    ['POSTGRES_CONNECTION_TIMEOUT', '-1'],
    ['POSTGRES_KEEP_ALIVE', 'yes'],
  ] as const)('fails fast for unsafe runtime configuration %s=%s', (name, value) => {
    expect(() => parseEnv({ ...validEnv, [name]: value })).toThrow(name);
  });

  it('accepts zero for ephemeral ports and disabled PostgreSQL timeouts', () => {
    expect(
      parseEnv({
        ...validEnv,
        PORT: '0',
        POSTGRES_IDLE_TIMEOUT: '0',
        POSTGRES_CONNECTION_TIMEOUT: '0',
        POSTGRES_KEEP_ALIVE: 'false',
      }),
    ).toMatchObject({
      PORT: 0,
      POSTGRES_IDLE_TIMEOUT: 0,
      POSTGRES_CONNECTION_TIMEOUT: 0,
      POSTGRES_KEEP_ALIVE: false,
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
