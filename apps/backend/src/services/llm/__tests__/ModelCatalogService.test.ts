import { describe, expect, it, vi } from 'vitest';

import { DEPLOYMENT_CATALOG } from '../../../infrastructure/llm/deploymentCatalog.js';
import { createProviderRegistry } from '../../../infrastructure/llm/providerRegistry.js';
import type { DeploymentDefinition } from '../../../types/conversations.js';
import type { LlmProvider, ProviderRegistry } from '../../../types/llm.js';
import { ModelCatalogService } from '../ModelCatalogService.js';

const defaultDeploymentIds = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
} as const;

const unavailableDefaultCases = [
  { providers: ['google', 'openrouter'], missing: ['openai-5.6-sol'] },
  { providers: ['openai', 'openrouter'], missing: ['gemini-3.7-flash'] },
  {
    providers: ['openai', 'google'],
    missing: ['openrouter-minimax-m3', 'openrouter-qwen-3.8-max'],
  },
  {
    providers: ['openrouter'],
    missing: ['openai-5.6-sol', 'gemini-3.7-flash'],
  },
  {
    providers: ['google'],
    missing: ['openai-5.6-sol', 'openrouter-minimax-m3', 'openrouter-qwen-3.8-max'],
  },
  {
    providers: ['openai'],
    missing: ['gemini-3.7-flash', 'openrouter-minimax-m3', 'openrouter-qwen-3.8-max'],
  },
  {
    providers: [],
    missing: Object.values(defaultDeploymentIds),
  },
] as const;

const definitions = [
  definition('deployment-z', 'Zulu', 'openai', 'shared-model'),
  definition('deployment-a-1', 'Alpha', 'google'),
  definition('deployment-b', 'Bravo', 'openai'),
  definition('deployment-a-2', 'Alpha', 'google', 'shared-model'),
  definition('deployment-offline', 'Offline', 'openrouter'),
] as const;

describe('ModelCatalogService', () => {
  it('returns only safe available fields sorted by display name and keeps source order for ties', () => {
    const service = new ModelCatalogService(definitions, registry('openai', 'google'));

    expect(service.listAvailableDeployments()).toEqual([
      publicDefinition(definitions[1]),
      publicDefinition(definitions[3]),
      publicDefinition(definitions[2]),
      publicDefinition(definitions[0]),
    ]);
  });

  it('derives catalog availability from credentials while direct MiniMax and Qwen remain registry-only', () => {
    const environment = {
      OPENAI_API_KEY: 'openai-test-key',
      OPENAI_BASE_URL: undefined,
      GOOGLE_API_KEY: 'google-test-key',
      GOOGLE_BASE_URL: undefined,
      MINIMAX_API_KEY: 'minimax-test-key',
      MINIMAX_BASE_URL: undefined,
      QWEN_API_KEY: 'qwen-test-key',
      QWEN_BASE_URL: undefined,
      MOONSHOT_API_KEY: 'moonshot-test-key',
      OPENROUTER_API_KEY: undefined,
      LLM_PROVIDER_TIMEOUT_MS: 1_000,
    };
    const providers = createProviderRegistry(environment);

    expect(Object.keys(providers)).toEqual(['openai', 'google', 'minimax', 'qwen', 'kimi']);
    expect(providers.minimax?.providerId).toBe('minimax');
    expect(providers.qwen?.providerId).toBe('qwen');
    expect(
      new ModelCatalogService(DEPLOYMENT_CATALOG, providers).listAvailableDeployments()
    ).toEqual([
      publicDefinition(DEPLOYMENT_CATALOG[7]),
      publicDefinition(DEPLOYMENT_CATALOG[10]),
      publicDefinition(DEPLOYMENT_CATALOG[8]),
      publicDefinition(DEPLOYMENT_CATALOG[9]),
      publicDefinition(DEPLOYMENT_CATALOG[3]),
    ]);

    const withoutKimi = createProviderRegistry({ ...environment, MOONSHOT_API_KEY: undefined });
    expect(Object.keys(withoutKimi)).toEqual(['openai', 'google', 'minimax', 'qwen']);
    expect(
      new ModelCatalogService(DEPLOYMENT_CATALOG, withoutKimi)
        .listAvailableDeployments()
        .map(({ deploymentId }) => deploymentId)
    ).not.toContain('kimi-k3');
  });

  it('accepts distinct IDs from the same provider and for the same underlying model', () => {
    const service = new ModelCatalogService(definitions, registry('openai', 'google'));

    const result = service.resolveExplicitAssignment({
      'base-1': 'deployment-a-1',
      'base-2': 'deployment-b',
      'base-3': 'deployment-a-2',
      consolidator: 'deployment-z',
    });

    expect(result).toEqual({
      kind: 'resolved',
      deployments: [
        { slot: 'base-1', ...publicDefinition(definitions[1]) },
        { slot: 'base-2', ...publicDefinition(definitions[2]) },
        { slot: 'base-3', ...publicDefinition(definitions[3]) },
        { slot: 'consolidator', ...publicDefinition(definitions[0]) },
      ],
    });
  });

  it('rejects an exact deployment ID repeated across slots', () => {
    const service = new ModelCatalogService(definitions, registry('openai', 'google'));

    expect(
      service.resolveExplicitAssignment({
        'base-1': 'deployment-a-1',
        'base-2': 'deployment-b',
        'base-3': 'deployment-a-1',
        consolidator: 'deployment-z',
      })
    ).toEqual({ kind: 'duplicate' });
  });

  it('rejects unknown and currently unavailable deployment IDs with one safe outcome', () => {
    const service = new ModelCatalogService(definitions, registry('openai', 'google'));
    const valid = {
      'base-1': 'deployment-a-1',
      'base-2': 'deployment-b',
      'base-3': 'deployment-a-2',
      consolidator: 'deployment-z',
    } as const;

    expect(service.resolveExplicitAssignment({ ...valid, 'base-1': 'unknown' })).toEqual({
      kind: 'unavailable',
    });
    expect(
      service.resolveExplicitAssignment({ ...valid, consolidator: 'deployment-offline' })
    ).toEqual({ kind: 'unavailable' });
  });

  it('resolves the exact four-slot default only when every required provider is available', () => {
    const service = new ModelCatalogService(
      DEPLOYMENT_CATALOG,
      registry('openai', 'google', 'openrouter')
    );

    const result = service.resolveDefaultAssignment();

    expect(result.kind).toBe('resolved');
    if (result.kind !== 'resolved') throw new Error('Expected the complete default profile');
    expect(
      Object.fromEntries(result.deployments.map(({ slot, deploymentId }) => [slot, deploymentId]))
    ).toEqual(defaultDeploymentIds);
  });

  it.each(unavailableDefaultCases)(
    'rejects the default all-or-nothing and reports only missing IDs for providers $providers',
    ({ providers, missing }) => {
      const service = new ModelCatalogService(DEPLOYMENT_CATALOG, registry(...providers));

      expect(service.resolveDefaultAssignment()).toEqual({
        kind: 'unavailable',
        missingDeploymentIds: missing,
      });
    }
  );
});

function definition(
  deploymentId: string,
  displayName: string,
  providerId: DeploymentDefinition['providerId'],
  modelId = `${deploymentId}-model`
): DeploymentDefinition {
  return {
    deploymentId,
    displayName,
    providerId,
    modelId,
    supportsWebSearch: providerId === 'openrouter',
    contextLimitTokens: 10_000,
    maxOutputTokens: 1_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    credentialEnv:
      providerId === 'google'
        ? 'GOOGLE_API_KEY'
        : providerId === 'openrouter'
          ? 'OPENROUTER_API_KEY'
          : 'OPENAI_API_KEY',
  };
}

function registry(...providerIds: DeploymentDefinition['providerId'][]): ProviderRegistry {
  return Object.fromEntries(
    providerIds.map(providerId => [
      providerId,
      {
        providerId,
        measureInputTokens: vi.fn(async () => 1),
        generate: vi.fn(),
      } satisfies LlmProvider,
    ])
  );
}

function publicDefinition({ credentialEnv: _credentialEnv, ...definition }: DeploymentDefinition) {
  return definition;
}
