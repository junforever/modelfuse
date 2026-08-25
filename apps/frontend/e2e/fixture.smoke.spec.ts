import {
  defaultDeploymentIds,
  deploymentSummaries,
  expect,
  mixedDeploymentIds,
  test,
} from './fixtures/modelFuse';
import { canonicalSlots } from './support/scenarios';

test('provides the canonical deterministic catalog and model slots', ({
  deploymentCatalog,
  fakeProviders,
}) => {
  expect(deploymentCatalog).toHaveLength(10);
  expect(deploymentCatalog.map(deployment => deployment.displayName)).toEqual([
    'DeepSeek V4 Flash 0731',
    'Gemini 3.7 Flash',
    'GLM 5.2',
    'GPT-5.6 Luna',
    'GPT-5.6 Sol',
    'GPT-5.6 Terra',
    'Kimi K3',
    'MiniMax M2.7',
    'MiniMax M3',
    'Qwen 3.8 Max',
  ]);
  expect(fakeProviders.map(provider => provider.slot)).toEqual(canonicalSlots);
  expect(
    fakeProviders.map(({ slot, deploymentId, providerId, modelId, displayName }) => ({
      slot,
      deploymentId,
      providerId,
      modelId,
      displayName,
    }))
  ).toEqual(deploymentSummaries(defaultDeploymentIds));
  expect(new Set(Object.values(mixedDeploymentIds)).size).toBe(4);
  expect(fakeProviders.every(provider => provider.content.length > 0)).toBe(true);
});
