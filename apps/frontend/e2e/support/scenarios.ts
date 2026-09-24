import type {
  ConversationDeploymentSummary,
  DeploymentCatalogItem,
  DeploymentIds,
  ProviderId,
  ResponseSlot,
} from '../../src/features/conversations/types/conversation';

export const E2E_FRONTEND_ORIGIN = 'http://127.0.0.1:3000';
export const E2E_BACKEND_ORIGIN = 'http://127.0.0.1:3001';
export const E2E_API_BASE_URL = `${E2E_BACKEND_ORIGIN}/api/v1`;

export const canonicalSlots = ['base-1', 'base-2', 'base-3', 'consolidator'] as const;

export const fakeDeploymentCatalog = [
  {
    deploymentId: 'openrouter-deepseek-v4-flash-0731',
    displayName: 'DeepSeek V4 Flash 0731',
    providerId: 'openrouter',
    modelId: 'deepseek/deepseek-v4-flash-0731',
    contextLimitTokens: 1048576,
    inputModalities: ['text'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'gemini-3.7-flash',
    displayName: 'Gemini 3.7 Flash',
    providerId: 'google',
    modelId: 'gemini-3.7-flash',
    contextLimitTokens: 1048576,
    inputModalities: ['text', 'image', 'video', 'audio', 'pdf'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openrouter-glm-5.2',
    displayName: 'GLM 5.2',
    providerId: 'openrouter',
    modelId: 'z-ai/glm-5.2',
    contextLimitTokens: 1048576,
    inputModalities: ['text'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openai-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    providerId: 'openai',
    modelId: 'gpt-5.6-luna',
    contextLimitTokens: 1050000,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openai-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    providerId: 'openai',
    modelId: 'gpt-5.6-sol',
    contextLimitTokens: 1050000,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openai-5.6-terra',
    displayName: 'GPT-5.6 Terra',
    providerId: 'openai',
    modelId: 'gpt-5.6-terra',
    contextLimitTokens: 1050000,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openrouter-kimi-k3',
    displayName: 'Kimi K3',
    providerId: 'openrouter',
    modelId: 'moonshotai/kimi-k3',
    contextLimitTokens: 1048576,
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openrouter-minimax-m2.7',
    displayName: 'MiniMax M2.7',
    providerId: 'openrouter',
    modelId: 'minimax/minimax-m2.7',
    contextLimitTokens: 204800,
    inputModalities: ['text'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openrouter-minimax-m3',
    displayName: 'MiniMax M3',
    providerId: 'openrouter',
    modelId: 'minimax/minimax-m3',
    contextLimitTokens: 524288,
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
  },
  {
    deploymentId: 'openrouter-qwen-3.8-max',
    displayName: 'Qwen 3.8 Max',
    providerId: 'openrouter',
    modelId: 'qwen/qwen3.8-max',
    contextLimitTokens: 1000000,
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
  },
] as const satisfies readonly DeploymentCatalogItem[];

export const defaultDeploymentIds = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
} as const satisfies DeploymentIds;

export const mixedDeploymentIds = {
  'base-1': 'openrouter-deepseek-v4-flash-0731',
  'base-2': 'openai-5.6-terra',
  'base-3': 'gemini-3.7-flash',
  consolidator: 'openrouter-kimi-k3',
} as const satisfies DeploymentIds;

export const catalogScenarioProviders = {
  full: ['openai', 'google', 'openrouter'],
  'without-openai': ['google', 'openrouter'],
  'without-openrouter': ['openai', 'google'],
} as const satisfies Readonly<Record<string, readonly ProviderId[]>>;

export type CatalogScenario = keyof typeof catalogScenarioProviders;

export function catalogScenarioAuthorization(runId: string, scenario: CatalogScenario): string {
  return `Bearer modelfuse-e2e:${runId}:${scenario}`;
}

function deploymentSummary<Slot extends ResponseSlot>(
  slot: Slot,
  deploymentId: string
): ConversationDeploymentSummary<Slot> {
  const deployment = fakeDeploymentCatalog.find(item => item.deploymentId === deploymentId);
  if (!deployment) throw new Error(`Unknown E2E deployment: ${deploymentId}`);
  return {
    slot,
    deploymentId: deployment.deploymentId,
    providerId: deployment.providerId,
    modelId: deployment.modelId,
    displayName: deployment.displayName,
  };
}

export function deploymentSummaries(deploymentIds: DeploymentIds) {
  return [
    deploymentSummary('base-1', deploymentIds['base-1']),
    deploymentSummary('base-2', deploymentIds['base-2']),
    deploymentSummary('base-3', deploymentIds['base-3']),
    deploymentSummary('consolidator', deploymentIds.consolidator),
  ] as const;
}

export function fakeResponseContent(slot: ResponseSlot, deploymentId: string): string {
  return `${slot} response from ${deploymentId}`;
}

export const fakeModelResponses = deploymentSummaries(defaultDeploymentIds).map(deployment => ({
  ...deployment,
  provider: deployment.providerId,
  model: deployment.modelId,
  content: fakeResponseContent(deployment.slot, deployment.deploymentId),
}));

export const fakeModelScenarios = {
  comparison: {
    marker: '[e2e:comparison]',
    prompt: '[e2e:comparison] Compare deterministic deployment responses.',
  },
  retry: {
    marker: '[e2e:base-1-fails-once]',
    prompt: '[e2e:base-1-fails-once] Recover and reconsolidate this response.',
    initialConsolidatorContent: 'Consolidator partial response',
    recoveredBase1Content: 'Base 1 recovered response',
    reconsolidatedContent: 'Consolidator reconsolidated response',
  },
  continueWithout: {
    marker: '[e2e:base-1-fails]',
    prompt: '[e2e:base-1-fails] Continue without the unavailable response.',
  },
  continuationBusy: {
    marker: '[e2e:continuation-busy]',
    prompt: '[e2e:continuation-busy] Keep this follow-up active until explicitly released.',
  },
  contextProtection: {
    marker: '[e2e:context-protection]',
    prompt:
      '[e2e:context-protection] Use the bounded context safely. ' +
      'Preserve only the relevant recent details while answering this follow-up.',
  },
} as const;
