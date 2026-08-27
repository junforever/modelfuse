import process from 'node:process';

import { test as base, expect, type Response } from '@playwright/test';

import {
  catalogScenarioAuthorization,
  defaultDeploymentIds,
  deploymentSummaries,
  E2E_BACKEND_ORIGIN,
  fakeDeploymentCatalog,
  fakeModelResponses,
  fakeModelScenarios,
  mixedDeploymentIds,
  type CatalogScenario,
} from '../support/scenarios';

export {
  defaultDeploymentIds,
  deploymentSummaries,
  fakeDeploymentCatalog,
  fakeModelResponses,
  fakeModelScenarios,
  mixedDeploymentIds,
};

type ScenarioPrompts = Record<keyof typeof fakeModelScenarios, string>;

type ModelFuseFixtures = {
  catalogScenario: CatalogScenario;
  deploymentCatalog: typeof fakeDeploymentCatalog;
  fakeProviders: typeof fakeModelResponses;
  scenarioPrompts: ScenarioPrompts;
};

export const test = base.extend<ModelFuseFixtures>({
  catalogScenario: ['full', { option: true }],
  deploymentCatalog: async ({ browserName }, provide) => {
    void browserName;
    await provide(fakeDeploymentCatalog);
  },
  fakeProviders: async ({ browserName }, provide) => {
    void browserName;
    await provide(fakeModelResponses);
  },
  scenarioPrompts: async ({ browserName }, provide, testInfo) => {
    void browserName;
    const runId = process.env.MODELFUSE_E2E_RUN_ID;
    if (!runId) throw new Error('MODELFUSE_E2E_RUN_ID is required');
    const owner = `[run:${runId}:${testInfo.parallelIndex}:${testInfo.repeatEachIndex}:${testInfo.retry}]`;
    await provide({
      comparison: `${fakeModelScenarios.comparison.prompt} ${owner}`,
      retry: `${fakeModelScenarios.retry.prompt} ${owner}`,
      continueWithout: `${fakeModelScenarios.continueWithout.prompt} ${owner}`,
      continuationBusy: `${fakeModelScenarios.continuationBusy.prompt} ${owner}`,
      contextProtection: `${fakeModelScenarios.contextProtection.prompt} ${owner}`,
    });
  },
  page: async ({ page, request, catalogScenario }, provide) => {
    const runId = process.env.MODELFUSE_E2E_RUN_ID;
    if (!runId) throw new Error('MODELFUSE_E2E_RUN_ID is required');
    await page.setExtraHTTPHeaders({
      authorization: catalogScenarioAuthorization(runId, catalogScenario),
    });
    const conversationIds = new Set<string>();
    const captures: Promise<void>[] = [];
    const captureConversation = (response: Response) => {
      if (
        response.status() !== 201 ||
        response.request().method() !== 'POST' ||
        !new URL(response.url()).pathname.endsWith('/api/v1/conversations')
      ) {
        return;
      }

      captures.push(
        response.json().then((body: { conversation?: { id?: unknown } }) => {
          if (typeof body.conversation?.id === 'string') conversationIds.add(body.conversation.id);
        })
      );
    };

    page.on('response', captureConversation);
    await provide(page);
    page.off('response', captureConversation);
    await Promise.all(captures);

    for (const conversationId of conversationIds) {
      const cleanup = await request.delete(
        `${E2E_BACKEND_ORIGIN}/__e2e/conversations/${conversationId}`
      );
      if (![204, 404].includes(cleanup.status())) {
        throw new Error(`E2E cleanup rejected owned conversation ${conversationId}`);
      }
    }
  },
});

export { expect };
