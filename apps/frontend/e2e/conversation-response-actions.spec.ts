import type { Page, Response } from '@playwright/test';

import type {
  ApiError,
  ConversationTurnResponse,
} from '../src/features/conversations/types/conversation';
import { expect, fakeModelScenarios, test } from './fixtures/modelFuse';

async function createConversation(page: Page, prompt: string): Promise<ConversationTurnResponse> {
  const responsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/api/v1/conversations')
  );

  await page.getByRole('textbox', { name: 'Prompt' }).fill(prompt);
  await page.getByRole('button', { name: 'Enviar' }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(202);
  return response.json() as Promise<ConversationTurnResponse>;
}

function waitForTurnStream(page: Page): Promise<Response> {
  return page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      /\/api\/v1\/conversations\/[^/]+\/turns\/[^/]+\/events$/.test(
        new URL(response.url()).pathname
      )
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('retries one failed slot and replaces the stale consolidation', async ({
  page,
  scenarioPrompts,
}) => {
  const initialStreamPromise = waitForTurnStream(page);
  await createConversation(page, scenarioPrompts.retry);
  const initialStream = await initialStreamPromise;

  await page.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reintentar OpenAI' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continuar sin OpenAI' })).toBeVisible();

  await page.getByRole('tab', { name: 'Qwen', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Qwen' })).toContainText(
    fakeModelScenarios.retry.initialQwenContent
  );
  await initialStream.finished();

  await page.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  const retryResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/responses\/openai\/retry$/.test(new URL(response.url()).pathname)
  );
  const retryStreamPromise = waitForTurnStream(page);
  await page.getByRole('button', { name: 'Reintentar OpenAI' }).click();

  expect((await retryResponsePromise).status()).toBe(202);
  const retryStream = await retryStreamPromise;
  await expect(page.getByRole('tabpanel', { name: 'OpenAI' })).toContainText(
    fakeModelScenarios.retry.recoveredOpenAiContent
  );

  await page.getByRole('tab', { name: 'Qwen', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Qwen' })).toContainText(
    fakeModelScenarios.retry.reconsolidatedQwenContent
  );
  await expect(page.getByRole('status').filter({ hasText: 'Procesando respuestas' })).toBeHidden();
  await retryStream.finished();
});

test('persists Continue-without and rejects a later retry with 409', async ({
  page,
  scenarioPrompts,
}) => {
  await createConversation(page, scenarioPrompts.continueWithout);

  await page.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar sin OpenAI' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar sin OpenAI' }).click();

  const dialog = page.getByRole('dialog', { name: 'Continuar sin OpenAI' });
  await expect(dialog).toContainText('permanente');
  await expect(dialog).toContainText('no podrás reintentar');

  const continueResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/responses\/openai\/continue-without$/.test(new URL(response.url()).pathname)
  );
  await dialog.getByRole('button', { name: 'Confirmar continuar sin OpenAI' }).click();
  const continueResponse = await continueResponsePromise;
  expect(continueResponse.status()).toBe(200);

  const { conversation, turn } = (await continueResponse.json()) as ConversationTurnResponse;
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reintentar OpenAI' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continuar sin OpenAI' })).toHaveCount(0);

  const retryResponse = await page.request.post(
    new URL(
      `/api/v1/conversations/${conversation.id}/turns/${turn.id}/responses/openai/retry`,
      continueResponse.url()
    ).toString()
  );
  expect(retryResponse.status()).toBe(409);
  await expect(retryResponse.json() as Promise<ApiError>).resolves.toMatchObject({
    code: 'RESPONSE_NOT_RETRYABLE',
  });
});
