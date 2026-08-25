import type { Page, Request } from '@playwright/test';

import type {
  ConversationDetail,
  ConversationPage,
  DeploymentIds,
  TurnPage,
} from '../src/features/conversations/types/conversation';
import { defaultDeploymentIds, expect, test } from './fixtures/modelFuse';
import { expectDeploymentSummaries, submitPrompt } from './support/journeys';
import { E2E_BACKEND_ORIGIN } from './support/scenarios';

const CREATE_CONVERSATION = /\/api\/v1\/conversations$/;

async function chooseDeployment(page: Page, slot: string, deployment: string): Promise<void> {
  await page.getByRole('combobox', { name: slot }).click();
  await page.getByRole('option', { name: deployment, exact: true }).click();
}

test('creates a text-only conversation with the complete default profile', async ({
  page,
  request,
  scenarioPrompts,
}) => {
  await page.goto('/');

  const defaults = [
    ['Base 1', 'GPT-5.6 Sol · openai'],
    ['Base 2', 'Gemini 3.7 Flash · google'],
    ['Base 3', 'MiniMax M3 · openrouter'],
    ['Consolidador', 'Qwen 3.8 Max · openrouter'],
  ] as const;
  await expect(page.getByRole('combobox')).toHaveCount(4);
  for (const [slot, deployment] of defaults) {
    await page.getByRole('combobox', { name: slot }).click();
    await expect(page.getByRole('option', { name: deployment, selected: true })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await expect(
    page.getByRole('button', { name: /adjuntar|subir (?:archivo|imagen|audio|video|pdf)/i })
  ).toHaveCount(0);

  const creationRequestPromise = page.waitForRequest(
    outgoing =>
      outgoing.method() === 'POST' && CREATE_CONVERSATION.test(new URL(outgoing.url()).pathname)
  );
  const created = await submitPrompt(page, scenarioPrompts.comparison, CREATE_CONVERSATION);
  const creationRequest = await creationRequestPromise;
  expect(creationRequest.postDataJSON()).toEqual({
    clientRequestId: expect.any(String),
    prompt: scenarioPrompts.comparison,
    deploymentIds: defaultDeploymentIds,
  });
  expectDeploymentSummaries(created.result, defaultDeploymentIds);
  await created.stream.finished();

  const detailResponse = await request.get(
    `${E2E_BACKEND_ORIGIN}/api/v1/conversations/${created.result.conversation.id}`
  );
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()) as ConversationDetail;
  expect(detail.deployments).toEqual(created.result.conversation.deployments);
});

test('blocks duplicate deployments before creating a conversation', async ({
  page,
  scenarioPrompts,
}) => {
  await page.goto('/');
  await expect(page.getByRole('combobox')).toHaveCount(4);

  let conversationPosts = 0;
  const countConversationPosts = (outgoing: Request) => {
    if (
      outgoing.method() === 'POST' &&
      CREATE_CONVERSATION.test(new URL(outgoing.url()).pathname)
    ) {
      conversationPosts += 1;
    }
  };
  page.on('request', countConversationPosts);

  await chooseDeployment(page, 'Base 2', 'GPT-5.6 Sol · openai');
  await page.getByRole('textbox', { name: 'Prompt' }).fill(scenarioPrompts.comparison);

  const error = 'Cada slot debe usar un deployment distinto.';
  await expect(page.getByRole('alert')).toHaveText(error);
  await expect(page.getByRole('combobox', { name: 'Base 1' })).toHaveAccessibleDescription(error);
  await expect(page.getByRole('combobox', { name: 'Base 2' })).toHaveAccessibleDescription(error);
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  expect(conversationPosts).toBe(0);
  page.off('request', countConversationPosts);
});

test.describe('when the default profile is unavailable', () => {
  test.use({ catalogScenario: 'without-openrouter' });

  test('requires four explicit available deployments and then creates successfully', async ({
    page,
    scenarioPrompts,
  }) => {
    await page.goto('/');

    const deploymentSelectors = page.getByRole('group', { name: 'Deployments' });
    await expect(deploymentSelectors.getByRole('status')).toHaveText(
      'El perfil predeterminado no está disponible. Selecciona un deployment para cada slot.'
    );
    for (const selector of await page.getByRole('combobox').all()) {
      await expect(selector).toContainText('Selecciona un deployment');
    }

    const explicitSelection: DeploymentIds = {
      'base-1': 'openai-5.6-sol',
      'base-2': 'openai-5.6-terra',
      'base-3': 'openai-5.6-luna',
      consolidator: 'gemini-3.7-flash',
    };
    await page.getByRole('combobox', { name: 'Base 1' }).click();
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(4);
    await expect(page.getByRole('option', { name: /openrouter/i })).toHaveCount(0);
    await page.getByRole('option', { name: 'GPT-5.6 Sol · openai', exact: true }).click();
    await chooseDeployment(page, 'Base 2', 'GPT-5.6 Terra · openai');
    await chooseDeployment(page, 'Base 3', 'GPT-5.6 Luna · openai');
    await chooseDeployment(page, 'Consolidador', 'Gemini 3.7 Flash · google');

    const owner = scenarioPrompts.comparison.slice(scenarioPrompts.comparison.indexOf('[run:'));
    const prompt = `Selección explícita ${owner}`;
    const created = await submitPrompt(page, prompt, CREATE_CONVERSATION);
    expectDeploymentSummaries(created.result, explicitSelection);
    await created.stream.finished();
  });
});

test('starts one local draft and persists its first prompt without inheriting prior context', async ({
  page,
  request,
  scenarioPrompts,
}) => {
  const owner = scenarioPrompts.comparison.slice(scenarioPrompts.comparison.indexOf('[run:'));
  const previousPrompt = `Anterior ${owner}`;
  const draftPrompt = `Nueva ${owner}`;

  await page.goto('/');
  const previous = await submitPrompt(page, previousPrompt, CREATE_CONVERSATION);
  await previous.stream.finished();
  await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEditable();

  const sidebar = page.getByRole('navigation', { name: 'Conversaciones' });
  const writesWhileStartingDraft: string[] = [];
  const captureConversationWrites = (outgoing: Request) => {
    const path = new URL(outgoing.url()).pathname;
    if (outgoing.method() !== 'GET' && path.startsWith('/api/v1/conversations')) {
      writesWhileStartingDraft.push(`${outgoing.method()} ${path}`);
    }
  };
  page.on('request', captureConversationWrites);

  await sidebar.getByRole('button', { name: 'Nueva conversación' }).click();
  await expect(page.getByRole('article', { name: 'Turno 1' })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: previousPrompt, exact: true })).toBeVisible();
  const persistedAfterDraftResponse = await request.get(
    `${E2E_BACKEND_ORIGIN}/api/v1/conversations`
  );
  expect(persistedAfterDraftResponse.status()).toBe(200);
  const persistedAfterDraft = (await persistedAfterDraftResponse.json()) as ConversationPage;
  expect(
    persistedAfterDraft.items
      .filter(conversation => conversation.title.includes(owner))
      .map(conversation => conversation.id)
  ).toEqual([previous.result.conversation.id]);
  expect(writesWhileStartingDraft).toEqual([]);
  page.off('request', captureConversationWrites);

  const created = await submitPrompt(page, draftPrompt, CREATE_CONVERSATION);
  expect(created.result.conversation.id).not.toBe(previous.result.conversation.id);
  expect(created.result.turn).toMatchObject({ ordinal: 1, prompt: draftPrompt });
  await created.stream.finished();

  await expect(sidebar.getByRole('button', { name: draftPrompt, exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(sidebar.getByRole('button', { name: previousPrompt, exact: true })).toBeVisible();

  const [previousHistoryResponse, draftHistoryResponse] = await Promise.all([
    request.get(
      `${E2E_BACKEND_ORIGIN}/api/v1/conversations/${previous.result.conversation.id}/turns`
    ),
    request.get(
      `${E2E_BACKEND_ORIGIN}/api/v1/conversations/${created.result.conversation.id}/turns`
    ),
  ]);
  expect(previousHistoryResponse.status()).toBe(200);
  expect(draftHistoryResponse.status()).toBe(200);

  const previousHistory = (await previousHistoryResponse.json()) as TurnPage;
  const draftHistory = (await draftHistoryResponse.json()) as TurnPage;
  expect(previousHistory.items.map(turn => turn.prompt)).toEqual([previousPrompt]);
  expect(draftHistory.items.map(turn => turn.prompt)).toEqual([draftPrompt]);
});
