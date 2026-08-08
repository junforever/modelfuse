import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

import type { ConversationTurnResponse } from '../../src/features/conversations/types/conversation';

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

  await page.getByRole('textbox', { name: 'Prompt' }).fill(prompt);
  await page.getByRole('button', { name: 'Enviar' }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(202);
  return {
    result: (await response.json()) as ConversationTurnResponse,
    stream: await streamPromise,
  };
}
