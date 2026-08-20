import type {
  ConversationDeploymentSnapshot,
  ConversationDeploymentSnapshotTuple,
  DeploymentAssignment,
  DeploymentCatalogItem,
  DeploymentDefinition,
  ResponseSlot,
} from '../../types/conversations.js';
import type { ProviderRegistry } from '../../types/llm.js';

export type ExplicitAssignmentResolution =
  | { readonly kind: 'resolved'; readonly deployments: ConversationDeploymentSnapshotTuple }
  | { readonly kind: 'unavailable' };

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

  resolveExplicitAssignment(assignment: DeploymentAssignment): ExplicitAssignmentResolution {
    const base1 = this.resolveSnapshot('base-1', assignment['base-1']);
    const base2 = this.resolveSnapshot('base-2', assignment['base-2']);
    const base3 = this.resolveSnapshot('base-3', assignment['base-3']);
    const consolidator = this.resolveSnapshot('consolidator', assignment.consolidator);

    return base1 && base2 && base3 && consolidator
      ? { kind: 'resolved', deployments: [base1, base2, base3, consolidator] }
      : { kind: 'unavailable' };
  }

  private resolveSnapshot<Slot extends ResponseSlot>(
    slot: Slot,
    deploymentId: string,
  ): ConversationDeploymentSnapshot<Slot> | undefined {
    const definition = this.getAvailableDeployment(deploymentId);
    if (!definition) return undefined;
    const { credentialEnv: _credentialEnv, ...deployment } = definition;
    return { slot, ...deployment };
  }
}
