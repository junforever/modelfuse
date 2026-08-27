import type { Page } from '@playwright/test';

import { RESPONSE_SLOT_LABELS } from '../src/features/conversations/types/conversation';
import {
  defaultDeploymentIds,
  deploymentSummaries,
  expect,
  fakeModelScenarios,
  test,
} from './fixtures/modelFuse';
import { E2E_BACKEND_ORIGIN } from './support/scenarios';
import { expectDeploymentSummaries, submitPrompt, waitForTurnStream } from './support/journeys';

const EVENTS_PATH = /\/api\/v1\/conversations\/[^/]+\/turns\/[^/]+\/events$/;
const EXPECTED_DEPLOYMENTS = deploymentSummaries(defaultDeploymentIds);

function ownedBusyPrompt(scenarioPrompt: string) {
  const owner = scenarioPrompt.slice(scenarioPrompt.indexOf('[run:'));
  return `G ${owner} ${fakeModelScenarios.continuationBusy.marker}`;
}

async function waitForTerminalTurn(
  page: Page,
  conversationId: string,
  turnId: string
): Promise<void> {
  await page.evaluate(
    ({ backendOrigin, conversationId: id, turnId: currentTurnId }) =>
      new Promise<void>((resolve, reject) => {
        const source = new EventSource(
          `${backendOrigin}/api/v1/conversations/${id}/turns/${currentTurnId}/events`
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
          reject(new Error('Conversation SSE failed before terminal state'));
        });
      }),
    { backendOrigin: E2E_BACKEND_ORIGIN, conversationId, turnId }
  );
}

async function expectReadOnlyAssignment(page: Page): Promise<void> {
  const assignment = page.getByRole('region', { name: 'Deployments de la conversación' });
  for (const deployment of EXPECTED_DEPLOYMENTS) {
    await expect(
      assignment.getByText(RESPONSE_SLOT_LABELS[deployment.slot], { exact: true })
    ).toBeVisible();
    await expect(assignment.getByText(deployment.displayName, { exact: true })).toBeVisible();
  }
  await expect(assignment.getByRole('combobox')).toHaveCount(0);
}

test('renames during busy, blocks Delete, then deletes the conversation persistently', async ({
  page,
  request,
  scenarioPrompts,
}) => {
  const prompt = ownedBusyPrompt(scenarioPrompts.continuationBusy);
  const renamedTitle = 'Renombrada <literal> con acento y ✨';

  await page.goto('/');
  const { result } = await submitPrompt(page, prompt, /\/api\/v1\/conversations$/);
  expectDeploymentSummaries(result, defaultDeploymentIds);
  let terminalObserved = false;
  try {
    await expect(
      page.getByRole('status').filter({ hasText: 'Procesando respuestas' })
    ).toBeVisible();

    const sidebar = page.getByRole('navigation', { name: 'Conversaciones' });
    await sidebar.getByRole('button', { name: `Acciones de ${prompt}` }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    await menu.getByRole('menuitem', { name: 'Renombrar' }).click();

    const renameDialog = page.getByRole('dialog', { name: 'Renombrar conversación' });
    await renameDialog
      .getByRole('textbox', { name: 'Nombre de la conversación' })
      .fill(renamedTitle);
    const renameResponsePromise = page.waitForResponse(
      response =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname.endsWith(`/api/v1/conversations/${result.conversation.id}`)
    );
    await renameDialog.getByRole('button', { name: 'Guardar' }).click();
    expect((await renameResponsePromise).status()).toBe(200);
    await expect(renameDialog).toBeHidden();
    await expect(sidebar.getByRole('button', { name: renamedTitle, exact: true })).toBeVisible();

    await page.reload();
    const reopenedStreamPromise = waitForTurnStream(page);
    await sidebar.getByRole('button', { name: renamedTitle, exact: true }).click();
    const reopenedStream = await reopenedStreamPromise;
    await expectReadOnlyAssignment(page);
    await expect(
      page.getByRole('status').filter({ hasText: 'Procesando respuestas' })
    ).toBeVisible();

    await sidebar.getByRole('button', { name: `Acciones de ${renamedTitle}` }).click();
    const reopenedMenu = page.getByRole('menu');
    const deleteItem = reopenedMenu.getByRole('menuitem', { name: 'Eliminar' });
    await expect(deleteItem).toBeDisabled();
    await expect(
      reopenedMenu.getByText(/no puedes eliminar mientras se procesan respuestas/i)
    ).toBeVisible();

    const release = await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
      params: { prompt },
    });
    expect(release.status()).toBe(204);
    await reopenedStream.finished();
    await expect(
      page.getByRole('status').filter({ hasText: 'Procesando respuestas' })
    ).toBeHidden();
    terminalObserved = true;
    await expect(deleteItem).toBeEnabled();
    await deleteItem.click();

    const deleteDialog = page.getByRole('dialog', { name: 'Eliminar conversación' });
    const deleteResponsePromise = page.waitForResponse(
      response =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname.endsWith(`/api/v1/conversations/${result.conversation.id}`)
    );
    await deleteDialog.getByRole('button', { name: 'Eliminar' }).click();
    expect((await deleteResponsePromise).status()).toBe(204);
    await expect(deleteDialog).toBeHidden();
    await expect(sidebar.getByRole('button', { name: renamedTitle, exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEditable();

    await page.reload();
    await expect(sidebar.getByRole('button', { name: renamedTitle, exact: true })).toHaveCount(0);
  } finally {
    if (!terminalObserved) {
      const terminalPromise = waitForTerminalTurn(page, result.conversation.id, result.turn.id);
      await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
        params: { prompt },
      });
      await terminalPromise;
    }
  }
});

test('shows a real-time update error when reopening a busy conversation loses SSE', async ({
  page,
  request,
  scenarioPrompts,
}) => {
  const prompt = ownedBusyPrompt(scenarioPrompts.continuationBusy);
  const events = '**/api/v1/conversations/*/turns/*/events';

  await page.goto('/');
  const { result } = await submitPrompt(page, prompt, /\/api\/v1\/conversations$/);
  expectDeploymentSummaries(result, defaultDeploymentIds);
  await page.route(events, route => route.abort('connectionfailed'));
  let terminalObserved = false;

  try {
    await page.reload();
    const streamRequestPromise = page.waitForRequest(request =>
      EVENTS_PATH.test(new URL(request.url()).pathname)
    );
    await page
      .getByRole('navigation', { name: 'Conversaciones' })
      .getByRole('button', { name: prompt, exact: true })
      .click();
    await streamRequestPromise;
    await expectReadOnlyAssignment(page);

    const streamError = page
      .getByRole('alert')
      .filter({ hasText: /actualización en tiempo real/i });
    await expect(streamError).toBeVisible();
    await expect(streamError).toContainText(/intenta.*más tarde/i);
    await page.getByRole('textbox', { name: 'Prompt' }).fill('No debe enviarse durante busy');
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    await page.unroute(events);
    const terminalPromise = waitForTerminalTurn(page, result.conversation.id, result.turn.id);
    const release = await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
      params: { prompt },
    });
    expect(release.status()).toBe(204);
    await terminalPromise;
    terminalObserved = true;
    await expect(streamError).toBeVisible();
  } finally {
    await page.unroute(events);
    if (!terminalObserved) {
      const terminalPromise = waitForTerminalTurn(page, result.conversation.id, result.turn.id);
      await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
        params: { prompt },
      });
      await terminalPromise;
    }
  }
});
