import type { ConversationDetail } from '../src/features/conversations/types/conversation';
import { deploymentSummaries, expect, mixedDeploymentIds, test } from './fixtures/modelFuse';
import { expectDeploymentSummaries, submitPrompt } from './support/journeys';
import { fakeResponseContent } from './support/scenarios';

const TAB_NAMES = {
  'base-1': 'Base 1',
  'base-2': 'Base 2',
  'base-3': 'Base 3',
  consolidator: 'Consolidador',
} as const;
const CREATE_CONVERSATION = /\/api\/v1\/conversations$/;

test('persists a mixed-provider comparison and reopens its immutable assignment', async ({
  page,
  scenarioPrompts,
}) => {
  await page.goto('/');
  const owner = scenarioPrompts.comparison.slice(scenarioPrompts.comparison.indexOf('[run:'));
  const prompt = `Mixta ${owner} [e2e:comparison]`;

  const selections = [
    ['Base 1', 'DeepSeek V4 Flash 0731 · openrouter'],
    ['Base 2', 'GPT-5.6 Terra · openai'],
    ['Base 3', 'Gemini 3.7 Flash · google'],
    ['Consolidador', 'Kimi K3 · openrouter'],
  ] as const;
  for (const [slot, deployment] of selections) {
    await page.getByRole('combobox', { name: slot }).click();
    await page.getByRole('option', { name: deployment, exact: true }).click();
  }

  const creationRequestPromise = page.waitForRequest(
    outgoing =>
      outgoing.method() === 'POST' && CREATE_CONVERSATION.test(new URL(outgoing.url()).pathname)
  );
  const created = await submitPrompt(page, prompt, CREATE_CONVERSATION);
  const creationRequest = await creationRequestPromise;
  expect(creationRequest.postDataJSON()).toEqual({
    clientRequestId: expect.any(String),
    prompt,
    deploymentIds: mixedDeploymentIds,
  });
  expectDeploymentSummaries(created.result, mixedDeploymentIds);

  const summaries = deploymentSummaries(mixedDeploymentIds);
  const assignment = page.getByRole('region', { name: 'Deployments de la conversación' });
  await expect(assignment).toBeVisible();
  for (const summary of summaries) {
    await expect(assignment.getByText(summary.displayName, { exact: true })).toBeVisible();
    const tabName = `${TAB_NAMES[summary.slot]} · ${summary.displayName}`;
    await page.getByRole('tab', { name: tabName, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: tabName })).toContainText(
      fakeResponseContent(summary.slot, summary.deploymentId)
    );
  }

  await expect(page.getByRole('status').filter({ hasText: 'Procesando respuestas' })).toBeHidden();
  await created.stream.finished();

  await page.reload();
  const conversationLink = page
    .getByRole('navigation', { name: 'Conversaciones' })
    .getByRole('button', { name: created.result.conversation.title, exact: true });
  await expect(conversationLink).toBeVisible();
  const detailResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/api/v1/conversations/${created.result.conversation.id}`
  );
  await conversationLink.click();
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()) as ConversationDetail;
  expect(detail.deployments).toEqual(summaries);

  await expect(assignment).toBeVisible();
  await expect(assignment.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  for (const summary of summaries) {
    await expect(assignment.getByText(summary.displayName, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('tab', {
        name: `${TAB_NAMES[summary.slot]} · ${summary.displayName}`,
        exact: true,
      })
    ).toBeVisible();
  }
});
