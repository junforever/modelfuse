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
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'duplicate' };

export type DefaultAssignmentResolution =
  | { readonly kind: 'resolved'; readonly deployments: ConversationDeploymentSnapshotTuple }
  | { readonly kind: 'unavailable'; readonly missingDeploymentIds: readonly string[] };

const DEFAULT_DEPLOYMENT_ASSIGNMENT = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
} as const satisfies DeploymentAssignment;

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
    const deploymentIds = Object.values(assignment);
    if (new Set(deploymentIds).size !== deploymentIds.length) return { kind: 'duplicate' };

    const base1 = this.resolveSnapshot('base-1', assignment['base-1']);
    const base2 = this.resolveSnapshot('base-2', assignment['base-2']);
    const base3 = this.resolveSnapshot('base-3', assignment['base-3']);
    const consolidator = this.resolveSnapshot('consolidator', assignment.consolidator);

    return base1 && base2 && base3 && consolidator
      ? { kind: 'resolved', deployments: [base1, base2, base3, consolidator] }
      : { kind: 'unavailable' };
  }

  resolveDefaultAssignment(): DefaultAssignmentResolution {
    const base1 = this.resolveSnapshot('base-1', DEFAULT_DEPLOYMENT_ASSIGNMENT['base-1']);
    const base2 = this.resolveSnapshot('base-2', DEFAULT_DEPLOYMENT_ASSIGNMENT['base-2']);
    const base3 = this.resolveSnapshot('base-3', DEFAULT_DEPLOYMENT_ASSIGNMENT['base-3']);
    const consolidator = this.resolveSnapshot(
      'consolidator',
      DEFAULT_DEPLOYMENT_ASSIGNMENT.consolidator
    );
    const missingDeploymentIds = [
      base1 ? undefined : DEFAULT_DEPLOYMENT_ASSIGNMENT['base-1'],
      base2 ? undefined : DEFAULT_DEPLOYMENT_ASSIGNMENT['base-2'],
      base3 ? undefined : DEFAULT_DEPLOYMENT_ASSIGNMENT['base-3'],
      consolidator ? undefined : DEFAULT_DEPLOYMENT_ASSIGNMENT.consolidator,
    ].filter(
      (deploymentId): deploymentId is NonNullable<typeof deploymentId> => deploymentId !== undefined
    );

    return missingDeploymentIds.length === 0 && base1 && base2 && base3 && consolidator
      ? { kind: 'resolved', deployments: [base1, base2, base3, consolidator] }
      : { kind: 'unavailable', missingDeploymentIds };
  }

  private resolveSnapshot<Slot extends ResponseSlot>(
    slot: Slot,
    deploymentId: string
  ): ConversationDeploymentSnapshot<Slot> | undefined {
    const definition = this.getAvailableDeployment(deploymentId);
    if (!definition) return undefined;
    const { credentialEnv: _credentialEnv, ...deployment } = definition;
    return { slot, ...deployment };
  }
}
