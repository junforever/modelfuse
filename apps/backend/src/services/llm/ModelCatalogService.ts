import type { DeploymentCatalogItem, DeploymentDefinition } from '../../types/conversations.js';
import type { ProviderRegistry } from '../../types/llm.js';

export class ModelCatalogService {
  private readonly definitionsById: ReadonlyMap<string, DeploymentDefinition>;

  constructor(
    definitions: readonly DeploymentDefinition[],
    private readonly providers: ProviderRegistry
  ) {
    this.definitionsById = new Map(
      definitions.map(definition => [definition.deploymentId, definition])
    );
  }

  listAvailableDeployments(): readonly DeploymentCatalogItem[] {
    return [...this.definitionsById.values()]
      .filter(definition => this.providers[definition.providerId] !== undefined)
      .map(({ credentialEnv: _credentialEnv, ...item }) => item)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  getAvailableDeployment(deploymentId: string): DeploymentDefinition | undefined {
    const definition = this.definitionsById.get(deploymentId);
    return definition && this.providers[definition.providerId] ? definition : undefined;
  }
}
