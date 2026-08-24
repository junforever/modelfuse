import type { DeploymentCatalogItem, DeploymentIds } from '../types/conversation';

const EMPTY_DEPLOYMENT_SELECTION: DeploymentIds = {
  'base-1': '',
  'base-2': '',
  'base-3': '',
  consolidator: '',
};

const DEFAULT_DEPLOYMENT_SELECTION: DeploymentIds = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
};

export function getDefaultDeploymentSelection(
  items: readonly DeploymentCatalogItem[]
): DeploymentIds {
  const availableDeploymentIds = new Set(items.map(item => item.deploymentId));
  return Object.values(DEFAULT_DEPLOYMENT_SELECTION).every(deploymentId =>
    availableDeploymentIds.has(deploymentId)
  )
    ? DEFAULT_DEPLOYMENT_SELECTION
    : EMPTY_DEPLOYMENT_SELECTION;
}

export function getDuplicateDeploymentIds(selection: DeploymentIds): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const deploymentId of Object.values(selection)) {
    if (!deploymentId) continue;
    if (seen.has(deploymentId)) duplicates.add(deploymentId);
    else seen.add(deploymentId);
  }

  return duplicates;
}
