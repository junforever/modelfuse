import type { Pool } from 'pg';

import type {
  CredentialEnvironmentVariable,
  DeploymentAssignment,
  DeploymentDefinition,
  ConversationDeploymentSnapshot,
  ConversationDeploymentSnapshotTuple,
  ConversationDeploymentSummary,
} from '../../types/conversations.js';

export const CANONICAL_SLOTS = ['base-1', 'base-2', 'base-3', 'consolidator'] as const;

export const TEST_DEPLOYMENT_SNAPSHOTS = [
  snapshot('base-1', 'openai'),
  snapshot('base-2', 'google'),
  snapshot('base-3', 'openrouter'),
  snapshot('consolidator', 'openrouter'),
] as const satisfies ConversationDeploymentSnapshotTuple;

export const TEST_DEPLOYMENT_SUMMARIES = TEST_DEPLOYMENT_SNAPSHOTS.map(
  ({ slot, deploymentId, providerId, modelId, displayName }) => ({
    slot,
    deploymentId,
    providerId,
    modelId,
    displayName,
  })
) as readonly ConversationDeploymentSummary[];

export const TEST_DEPLOYMENT_ASSIGNMENT = Object.fromEntries(
  TEST_DEPLOYMENT_SNAPSHOTS.map(({ slot, deploymentId }) => [slot, deploymentId])
) as DeploymentAssignment;

export const TEST_DEPLOYMENT_DEFINITIONS = TEST_DEPLOYMENT_SNAPSHOTS.map(snapshot => ({
  ...snapshot,
  credentialEnv: credentialEnvironment(snapshot.providerId),
})) as readonly DeploymentDefinition[];

export async function insertConversationDeployments(
  pool: Pool,
  conversationId: string,
  snapshots: ConversationDeploymentSnapshotTuple = TEST_DEPLOYMENT_SNAPSHOTS
): Promise<void> {
  for (const deployment of snapshots) {
    await pool.query(
      `INSERT INTO conversation_deployments
         (conversation_id, slot, deployment_id, provider_id, model_id, display_name,
          context_limit_tokens, max_output_tokens, input_modalities, output_modalities,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())`,
      [
        conversationId,
        deployment.slot,
        deployment.deploymentId,
        deployment.providerId,
        deployment.modelId,
        deployment.displayName,
        deployment.contextLimitTokens,
        deployment.maxOutputTokens,
        deployment.inputModalities,
        deployment.outputModalities,
      ]
    );
  }
}

function snapshot<Slot extends ConversationDeploymentSnapshotTuple[number]['slot']>(
  slot: Slot,
  providerId: ConversationDeploymentSnapshotTuple[number]['providerId']
): ConversationDeploymentSnapshot<Slot> {
  return {
    slot,
    deploymentId: `integration-${slot}`,
    providerId,
    modelId: `integration-${slot}-model`,
    displayName: `Integration ${slot}`,
    contextLimitTokens: 10_000,
    maxOutputTokens: 1_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
  } as const;
}

function credentialEnvironment(
  providerId: ConversationDeploymentSnapshotTuple[number]['providerId']
): CredentialEnvironmentVariable {
  switch (providerId) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'google':
      return 'GOOGLE_API_KEY';
    case 'minimax':
      return 'MINIMAX_API_KEY';
    case 'qwen':
      return 'QWEN_API_KEY';
    case 'kimi':
      return 'MOONSHOT_API_KEY';
    case 'openrouter':
      return 'OPENROUTER_API_KEY';
  }
}
