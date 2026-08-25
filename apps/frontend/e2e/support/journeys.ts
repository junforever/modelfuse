import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

import type {
  ConversationTurnResponse,
  DeploymentIds,
} from '../../src/features/conversations/types/conversation';
import { deploymentSummaries } from './scenarios';

export function waitForTurnStream(page: Page): Promise<Response> {
  return page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      /\/api\/v1\/conversations\/[^/]+\/turns\/[^/]+\/events$/.test(
        new URL(response.url()).pathname
      )
  );
}

export async function submitPrompt(page: Page, prompt: string, endpoint: RegExp) {
  const responsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' && endpoint.test(new URL(response.url()).pathname)
  );
  const streamPromise = waitForTurnStream(page);

  const composer = page.getByRole('textbox', { name: 'Prompt' });
  const submit = page.getByRole('button', { name: 'Enviar' });
  await expect(composer).toBeEditable();
  await composer.fill(prompt);
  await expect(submit).toBeEnabled();
  await submit.click();

  const response = await responsePromise;
  expect(response.status()).toBe(202);
  return {
    result: (await response.json()) as ConversationTurnResponse,
    stream: await streamPromise,
  };
}

export function expectDeploymentSummaries(
  result: ConversationTurnResponse,
  deploymentIds: DeploymentIds
): void {
  expect(result.conversation.deployments).toEqual(deploymentSummaries(deploymentIds));
}
