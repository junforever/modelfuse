import type { Request } from '@playwright/test';

import type { ConversationPage, TurnPage } from '../src/features/conversations/types/conversation';
import { expect, test } from './fixtures/modelFuse';
import { submitPrompt } from './support/journeys';
import { E2E_BACKEND_ORIGIN } from './support/scenarios';

const CREATE_CONVERSATION = /\/api\/v1\/conversations$/;

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
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeEnabled();

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
