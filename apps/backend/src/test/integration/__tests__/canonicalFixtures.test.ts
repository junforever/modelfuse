import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  RESPONSE_SLOTS,
  type ConversationDeploymentSnapshot,
} from '../../../types/conversations.js';
import { createIntegrationBackend } from '../createIntegrationBackend.js';
import { createControlledProviders, deferred } from '../controlledLlmProviders.js';

const fixtureUrl = new URL(
  '../../../services/conversations/__tests__/fixtures/consolidation-evaluation.json',
  import.meta.url
);

describe('canonical integration fixtures', () => {
  it('exposes deterministic controls for exactly the canonical slots', async () => {
    const providers = createControlledProviders();
    const gate = deferred();
    providers.consolidator.enqueueBlocked(gate.promise, 'Canonical consolidated response');

    const request = {
      slot: 'consolidator' as const,
      deployment: deployment('consolidator', 'qwen'),
      messages: [{ role: 'user' as const, content: 'Consolidate deterministically.' }],
      signal: new AbortController().signal,
    };
    const pending = providers.consolidator.generate(request);
    await providers.consolidator.waitUntilCalled();

    expect(Object.keys(providers)).toEqual(RESPONSE_SLOTS);
    expect(providers.consolidator.calls).toEqual([request]);
    expect(
      await providers.consolidator.measureInputTokens(request.deployment, request.messages)
    ).toBe(1);

    gate.resolve();
    await expect(pending).resolves.toMatchObject({
      content: 'Canonical consolidated response',
      provider: 'qwen-fake',
      model: 'qwen-test-model',
    });
  });

  it('keeps the consolidation fixture canonical and the backend factory importable', async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8')) as {
      cases: Array<{ baseResponses: Record<string, string>; missingSlots: string[] }>;
    };

    expect(createIntegrationBackend).toBeTypeOf('function');
    for (const testCase of fixture.cases) {
      expect(Object.keys(testCase.baseResponses)).toEqual(RESPONSE_SLOTS.slice(0, 3));
      expect(
        testCase.missingSlots.every(slot => RESPONSE_SLOTS.slice(0, 3).includes(slot as never))
      ).toBe(true);
    }
  });
});

function deployment(
  slot: ConversationDeploymentSnapshot['slot'],
  providerId: ConversationDeploymentSnapshot['providerId']
): ConversationDeploymentSnapshot {
  return {
    slot,
    deploymentId: `${providerId}-test-deployment`,
    displayName: `${providerId} test deployment`,
    providerId,
    modelId: `${providerId}-test-model`,
    contextLimitTokens: 10_000,
    maxOutputTokens: 1_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
  };
}
