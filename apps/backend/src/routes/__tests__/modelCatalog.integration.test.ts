import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { parseEnv } from '../../infrastructure/config/env.js';
import { DEPLOYMENT_CATALOG } from '../../infrastructure/llm/deploymentCatalog.js';
import { createProviderRegistry } from '../../infrastructure/llm/providerRegistry.js';
import { ModelCatalogService } from '../../services/llm/ModelCatalogService.js';
import type { ProviderId } from '../../types/conversations.js';
import { createModelCatalogRoutes } from '../modelCatalogRoutes.js';

const PROVIDER_ENVIRONMENT = {
  OPENAI_API_KEY: undefined,
  OPENAI_BASE_URL: undefined,
  GOOGLE_API_KEY: undefined,
  GOOGLE_BASE_URL: undefined,
  MINIMAX_API_KEY: undefined,
  MINIMAX_BASE_URL: undefined,
  QWEN_API_KEY: undefined,
  QWEN_BASE_URL: undefined,
  OPENROUTER_API_KEY: undefined,
  LLM_PROVIDER_TIMEOUT_MS: 1_000,
} as const;

const CREDENTIAL_CASES = [
  { name: 'all catalog providers', providers: ['openai', 'google', 'openrouter'] },
  { name: 'OpenAI and Google only', providers: ['openai', 'google'] },
  { name: 'OpenRouter only', providers: ['openrouter'] },
  { name: 'no provider', providers: [] },
] as const satisfies readonly {
  name: string;
  providers: readonly ProviderId[];
}[];

describe('GET /api/v1/model-catalog', () => {
  it.each(CREDENTIAL_CASES)(
    'returns exactly the safe, ordered available deployments for $name',
    async ({ providers }) => {
      const providerRegistry = createProviderRegistry({
        ...PROVIDER_ENVIRONMENT,
        OPENAI_API_KEY: providers.includes('openai') ? 'openai-test-key' : undefined,
        GOOGLE_API_KEY: providers.includes('google') ? 'google-test-key' : undefined,
        OPENROUTER_API_KEY: providers.includes('openrouter')
          ? 'openrouter-test-key'
          : undefined,
      });
      const modelCatalogService = new ModelCatalogService(
        DEPLOYMENT_CATALOG,
        providerRegistry,
      );

      const response = await request(createCatalogApp(modelCatalogService)).get(
        '/api/v1/model-catalog',
      );

      const expectedItems = DEPLOYMENT_CATALOG
        .filter(item => providers.includes(item.providerId))
        .map(({ credentialEnv: _credentialEnv, ...item }) => item)
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toEqual({ items: expectedItems });
      expect(
        response.body.items.map((item: Record<string, unknown>) => Object.keys(item).sort()),
      ).toEqual(
        expectedItems.map(() => [
          'contextLimitTokens',
          'deploymentId',
          'displayName',
          'inputModalities',
          'maxOutputTokens',
          'modelId',
          'outputModalities',
          'providerId',
        ]),
      );
      expect(JSON.stringify(response.body)).not.toMatch(
        /credentialEnv|secret|reason|price|cost|billing|credit|currency|budget/i,
      );
    },
  );

  it('assembles and serves the backend when every provider credential is absent', async () => {
    const environment = parseEnv({
      PORT: '0',
      NODE_ENV: 'test',
      FRONTEND_URL_LOCALHOST: 'http://localhost:5173',
      REQUEST_MAX_BODY_SIZE: '1mb',
      REQUEST_TIMEOUT: '15s',
      POSTGRES_USER: 'integration-user',
      POSTGRES_PASSWORD: 'integration-password',
      POSTGRES_DB: 'modelfuse_test',
      POSTGRES_MAX_CONNECTIONS: '2',
      POSTGRES_IDLE_TIMEOUT: '0',
      POSTGRES_CONNECTION_TIMEOUT: '0',
      POSTGRES_KEEP_ALIVE: 'false',
      LLM_PROVIDER_TIMEOUT_MS: '1000',
      CONVERSATION_CONTEXT_MAX_TURNS: '8',
      CONVERSATION_SIDEBAR_PAGE_SIZE: '20',
    });
    const providerRegistry = createProviderRegistry(environment);
    const modelCatalogService = new ModelCatalogService(
      DEPLOYMENT_CATALOG,
      providerRegistry,
    );
    const app = createCatalogApp(modelCatalogService);

    const response = await request(app).get('/api/v1/model-catalog');

    expect(Object.keys(providerRegistry)).toEqual([]);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });
});

function createCatalogApp(modelCatalogService: ModelCatalogService) {
  const app = express();
  app.use('/api/v1/model-catalog', createModelCatalogRoutes(modelCatalogService));
  return app;
}
