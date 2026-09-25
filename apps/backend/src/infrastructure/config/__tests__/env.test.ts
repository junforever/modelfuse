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
  GOOGLE_API_KEY: 'google-secret',
  MINIMAX_API_KEY: 'minimax-secret',
  QWEN_API_KEY: 'qwen-secret',
  MOONSHOT_API_KEY: 'moonshot-secret',
  OPENROUTER_API_KEY: 'openrouter-secret',
  LLM_PROVIDER_TIMEOUT_MS: '30000',
  CONVERSATION_CONTEXT_MAX_TURNS: '8',
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
      GOOGLE_API_KEY: 'google-secret',
      MINIMAX_API_KEY: 'minimax-secret',
      QWEN_API_KEY: 'qwen-secret',
      MOONSHOT_API_KEY: 'moonshot-secret',
      OPENROUTER_API_KEY: 'openrouter-secret',
      LLM_PROVIDER_TIMEOUT_MS: 30000,
      CONVERSATION_CONTEXT_MAX_TURNS: 8,
      LLM_CONTEXT_THRESHOLD_RATIO: 0.8,
      CONVERSATION_SIDEBAR_PAGE_SIZE: 20,
    });
  });

  it('selects a required HTTP(S) frontend origin for each runtime environment', () => {
    expect(() => parseEnv({ ...validEnv, FRONTEND_URL_LOCALHOST: '' })).toThrow(
      'FRONTEND_URL_LOCALHOST'
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
    expect(() => parseEnv({ ...production, FRONTEND_URL: 'javascript:alert(1)' })).toThrow(
      'FRONTEND_URL'
    );
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
      })
    ).toMatchObject({
      PORT: 0,
      POSTGRES_IDLE_TIMEOUT: 0,
      POSTGRES_CONNECTION_TIMEOUT: 0,
      POSTGRES_KEEP_ALIVE: false,
    });
  });

  it('trims configured provider credentials and treats blank or missing credentials as absent', () => {
    const parsed = parseEnv({
      ...validEnv,
      OPENAI_API_KEY: '  openai-trimmed  ',
      GOOGLE_API_KEY: '',
      MINIMAX_API_KEY: '   ',
      QWEN_API_KEY: undefined,
      MOONSHOT_API_KEY: '  moonshot-trimmed  ',
      OPENROUTER_API_KEY: '  openrouter-trimmed  ',
    });

    expect(parsed).toMatchObject({
      OPENAI_API_KEY: 'openai-trimmed',
      MOONSHOT_API_KEY: 'moonshot-trimmed',
      OPENROUTER_API_KEY: 'openrouter-trimmed',
    });
    expect(parsed.GOOGLE_API_KEY).toBeUndefined();
    expect(parsed.MINIMAX_API_KEY).toBeUndefined();
    expect(parsed.QWEN_API_KEY).toBeUndefined();

    const withoutProviderCredentials = parseEnv({
      ...validEnv,
      OPENAI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      MINIMAX_API_KEY: undefined,
      QWEN_API_KEY: undefined,
      MOONSHOT_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined,
    });

    expect({
      OPENAI_API_KEY: withoutProviderCredentials.OPENAI_API_KEY,
      GOOGLE_API_KEY: withoutProviderCredentials.GOOGLE_API_KEY,
      MINIMAX_API_KEY: withoutProviderCredentials.MINIMAX_API_KEY,
      QWEN_API_KEY: withoutProviderCredentials.QWEN_API_KEY,
      MOONSHOT_API_KEY: withoutProviderCredentials.MOONSHOT_API_KEY,
      OPENROUTER_API_KEY: withoutProviderCredentials.OPENROUTER_API_KEY,
    }).toEqual({
      OPENAI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      MINIMAX_API_KEY: undefined,
      QWEN_API_KEY: undefined,
      MOONSHOT_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined,
    });
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

  it.each(['0', '-0.1', '1.01', 'not-a-number'])(
    'rejects context threshold ratio outside (0, 1]: %s',
    value => {
      expect(() => parseEnv({ ...validEnv, LLM_CONTEXT_THRESHOLD_RATIO: value })).toThrow(
        'LLM_CONTEXT_THRESHOLD_RATIO'
      );
    }
  );

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
