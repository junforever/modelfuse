import { randomUUID } from 'node:crypto';

import type { Page, Response } from '@playwright/test';

import type { ConversationTurnResponse } from '../src/features/conversations/types/conversation';
import { expect, fakeModelResponses, test } from './fixtures/modelFuse';
import { E2E_BACKEND_ORIGIN } from './support/scenarios';

const TAB_NAMES = {
  openai: 'OpenAI',
  google: 'Google',
  minimax: 'MiniMax',
  qwen: 'Qwen',
} as const;

function waitForTurnStream(page: Page): Promise<Response> {
  return page.waitForResponse(response =>
    /\/api\/v1\/conversations\/[^/]+\/turns\/[^/]+\/events$/.test(new URL(response.url()).pathname)
  );
}

async function waitForTerminalTurn(
  page: Page,
  conversationId: string,
  turnId: string,
): Promise<void> {
  await page.evaluate(
    ({ backendOrigin, conversationId: id, turnId: currentTurnId }) =>
      new Promise<void>((resolve, reject) => {
        const source = new EventSource(
          `${backendOrigin}/api/v1/conversations/${id}/turns/${currentTurnId}/events`,
        );
        let terminal = false;
        let idle = false;

        const finish = (): void => {
          if (!terminal || !idle) return;
          source.close();
          resolve();
        };

        source.addEventListener('turn_update', event => {
          const data = JSON.parse((event as MessageEvent<string>).data) as {
            turn?: { status?: string };
          };
          terminal = ['completed', 'partial', 'failed'].includes(data.turn?.status ?? '');
          finish();
        });
        source.addEventListener('busy_update', event => {
          const data = JSON.parse((event as MessageEvent<string>).data) as {
            hasWorkInProgress?: boolean;
          };
          idle = data.hasWorkInProgress === false;
          finish();
        });
        source.addEventListener('error', () => {
          source.close();
          reject(new Error('Auxiliary conversation SSE failed before terminal state'));
        });
      }),
    { backendOrigin: E2E_BACKEND_ORIGIN, conversationId, turnId },
  );
}

async function submitPrompt(page: Page, prompt: string, path: RegExp) {
  const responsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' && path.test(new URL(response.url()).pathname)
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

test('continues one conversation with isolated slots, scoped busy state, and bounded context', async ({
  page,
  request,
  scenarioPrompts,
}) => {
  await page.goto('/');

  const initial = await submitPrompt(page, scenarioPrompts.comparison, /\/api\/v1\/conversations$/);
  await initial.stream.finished();
  await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEditable();

  const continuation = await submitPrompt(
    page,
    scenarioPrompts.continuationBusy,
    /\/api\/v1\/conversations\/[^/]+\/turns$/
  );
  expect(continuation.result.conversation.id).toBe(initial.result.conversation.id);
  expect(continuation.result.turn.ordinal).toBe(2);

  let otherConversationId: string | undefined;
  let otherTurnId: string | undefined;
  try {
    await expect(
      page.getByRole('status').filter({ hasText: 'Procesando respuestas' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    const busyResponse = await request.post(
      `${E2E_BACKEND_ORIGIN}/api/v1/conversations/${initial.result.conversation.id}/turns`,
      {
        data: {
          clientRequestId: randomUUID(),
          prompt: 'A distinct follow-up must be rejected while this conversation is busy.',
        },
      }
    );
    expect(busyResponse.status()).toBe(409);
    expect((await busyResponse.json()) as { code: string }).toMatchObject({
      code: 'CONVERSATION_BUSY',
    });

    const otherConversation = await request.post(`${E2E_BACKEND_ORIGIN}/api/v1/conversations`, {
      data: {
        clientRequestId: randomUUID(),
        prompt: scenarioPrompts.comparison,
      },
    });
    expect(otherConversation.status()).toBe(202);
    const otherResult = (await otherConversation.json()) as ConversationTurnResponse;
    otherConversationId = otherResult.conversation.id;
    otherTurnId = otherResult.turn.id;
    expect(otherConversationId).not.toBe(initial.result.conversation.id);
  } finally {
    const release = await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
      params: { prompt: scenarioPrompts.continuationBusy },
    });
    expect(release.status()).toBe(204);
    if (otherConversationId && otherTurnId) {
      await waitForTerminalTurn(page, otherConversationId, otherTurnId);
      const cleanup = await request.delete(
        `${E2E_BACKEND_ORIGIN}/__e2e/conversations/${otherConversationId}`
      );
      expect(cleanup.status()).toBe(204);
    }
  }

  await continuation.stream.finished();
  await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEditable();

  const secondTurn = page.getByRole('article', { name: 'Turno 2' });
  await expect(page.getByRole('article', { name: 'Turno 1' })).toBeVisible();
  await expect(secondTurn).toContainText(scenarioPrompts.continuationBusy);
  for (const response of fakeModelResponses) {
    const tabName = TAB_NAMES[response.slot];
    await secondTurn.getByRole('tab', { name: tabName, exact: true }).click();
    const panel = secondTurn.getByRole('tabpanel', { name: tabName });
    await expect(panel).toContainText(response.content);
    for (const other of fakeModelResponses.filter(candidate => candidate.slot !== response.slot)) {
      await expect(panel).not.toContainText(other.content);
    }
  }

  const protectedTurn = await submitPrompt(
    page,
    scenarioPrompts.contextProtection,
    /\/api\/v1\/conversations\/[^/]+\/turns$/
  );
  expect(protectedTurn.result.turn.ordinal).toBe(3);
  await protectedTurn.stream.finished();

  const thirdTurn = page.getByRole('article', { name: 'Turno 3' });
  await expect(thirdTurn).toContainText(scenarioPrompts.contextProtection);
  const contextNotice = thirdTurn
    .getByRole('status')
    .filter({ hasText: /ventana acotada del contexto/i });
  await expect(contextNotice).toBeVisible();
  await expect(contextNotice).not.toContainText(/tokens?|80%|turn-window|\b[1-9]\d*\b/i);
});
