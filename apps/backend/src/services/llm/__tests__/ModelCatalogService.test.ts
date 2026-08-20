import { describe, expect, it, vi } from 'vitest';

import type { DeploymentDefinition } from '../../../types/conversations.js';
import type { LlmProvider, ProviderRegistry } from '../../../types/llm.js';
import { ModelCatalogService } from '../ModelCatalogService.js';

const definitions = [
  definition('deployment-z', 'Zulu', 'openai'),
  definition('deployment-a', 'Alpha', 'google'),
  definition('deployment-b', 'Bravo', 'openai'),
  definition('deployment-c', 'Charlie', 'google'),
  definition('deployment-offline', 'Offline', 'openrouter'),
] as const;

describe('ModelCatalogService', () => {
  it('returns only available safe entries ordered by display name', () => {
    const service = new ModelCatalogService(definitions, registry('openai', 'google'));

    expect(service.listAvailableDeployments()).toEqual([
      publicDefinition(definitions[1]),
      publicDefinition(definitions[2]),
      publicDefinition(definitions[3]),
      publicDefinition(definitions[0]),
    ]);
    expect(JSON.stringify(service.listAvailableDeployments())).not.toContain('credentialEnv');
  });

  it('resolves arbitrary available IDs into the canonical snapshot order', () => {
    const service = new ModelCatalogService(definitions, registry('openai', 'google'));

    const result = service.resolveExplicitAssignment({
      'base-1': 'deployment-a',
      'base-2': 'deployment-b',
      'base-3': 'deployment-c',
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

  it('rejects unknown and currently unavailable deployment IDs with one safe outcome', () => {
    const service = new ModelCatalogService(definitions, registry('openai', 'google'));
    const valid = {
      'base-1': 'deployment-a',
      'base-2': 'deployment-b',
      'base-3': 'deployment-c',
      consolidator: 'deployment-z',
    } as const;

    expect(service.resolveExplicitAssignment({ ...valid, 'base-1': 'unknown' })).toEqual({
      kind: 'unavailable',
    });
    expect(
      service.resolveExplicitAssignment({ ...valid, consolidator: 'deployment-offline' }),
    ).toEqual({ kind: 'unavailable' });
  });
});

function definition(
  deploymentId: string,
  displayName: string,
  providerId: DeploymentDefinition['providerId'],
): DeploymentDefinition {
  return {
    deploymentId,
    displayName,
    providerId,
    modelId: `${deploymentId}-model`,
    contextLimitTokens: 10_000,
    maxOutputTokens: 1_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    credentialEnv: providerId === 'google' ? 'GOOGLE_API_KEY' : providerId === 'openrouter'
      ? 'OPENROUTER_API_KEY'
      : 'OPENAI_API_KEY',
  };
}

function registry(...providerIds: DeploymentDefinition['providerId'][]): ProviderRegistry {
  return Object.fromEntries(providerIds.map(providerId => [providerId, {
    providerId,
    measureInputTokens: vi.fn(async () => 1),
    generate: vi.fn(),
  } satisfies LlmProvider]));
}

function publicDefinition({ credentialEnv: _credentialEnv, ...definition }: DeploymentDefinition) {
  return definition;
}
