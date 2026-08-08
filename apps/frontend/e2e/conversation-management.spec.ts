import { expect, fakeModelScenarios, test } from './fixtures/modelFuse';
import { E2E_BACKEND_ORIGIN } from './support/scenarios';
import { submitPrompt, waitForTurnStream } from './support/journeys';

const EVENTS_PATH = /\/api\/v1\/conversations\/[^/]+\/turns\/[^/]+\/events$/;

function ownedBusyPrompt(scenarioPrompt: string) {
  const owner = scenarioPrompt.slice(scenarioPrompt.indexOf('[run:'));
  return `G ${owner} ${fakeModelScenarios.continuationBusy.marker}`;
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
    await expect(
      page.getByRole('status').filter({ hasText: 'Procesando respuestas' })
    ).toBeVisible();

    await sidebar.getByRole('button', { name: `Acciones de ${renamedTitle}` }).click();
    const deleteItem = page.getByRole('menuitem', { name: 'Eliminar' });
    await expect(deleteItem).toBeDisabled();
    await expect(page.getByText(/no se puede eliminar mientras.*proces/i)).toBeVisible();

    const release = await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
      params: { prompt },
    });
    expect(release.status()).toBe(204);
    await reopenedStream.finished();
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
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEnabled();

    await page.reload();
    await expect(sidebar.getByRole('button', { name: renamedTitle, exact: true })).toHaveCount(0);
  } finally {
    await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
      params: { prompt },
    });
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
  await page.route(events, route => route.abort('connectionfailed'));

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

    const streamError = page
      .getByRole('alert')
      .filter({ hasText: /actualización en tiempo real/i });
    await expect(streamError).toBeVisible();
    await expect(streamError).toContainText(/intenta.*más tarde/i);
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    const release = await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
      params: { prompt },
    });
    expect(release.status()).toBe(204);
    await expect
      .poll(async () => {
        const response = await request.get(
          `${E2E_BACKEND_ORIGIN}/api/v1/conversations/${result.conversation.id}`
        );
        return ((await response.json()) as { hasWorkInProgress: boolean }).hasWorkInProgress;
      })
      .toBe(false);
    await expect(streamError).toBeVisible();
  } finally {
    await page.unroute(events);
    await request.post(`${E2E_BACKEND_ORIGIN}/__e2e/release-continuation`, {
      params: { prompt },
    });
  }
});
