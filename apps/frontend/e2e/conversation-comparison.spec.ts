import { expect, fakeModelResponses, test } from './fixtures/modelFuse';

const TAB_NAMES = {
  openai: 'OpenAI',
  google: 'Google',
  minimax: 'MiniMax',
  qwen: 'Qwen',
} as const;

test('accepts a prompt, renders four final responses, and closes the turn stream', async ({
  page,
  scenarioPrompts,
}) => {
  await page.goto('/');

  const createResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/api/v1/conversations')
  );
  const streamResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      /\/api\/v1\/conversations\/[^/]+\/turns\/[^/]+\/events$/.test(
        new URL(response.url()).pathname
      )
  );

  const composer = page.getByRole('textbox', { name: 'Prompt' });
  const submit = page.getByRole('button', { name: 'Enviar' });
  await expect(composer).toBeEditable();
  await composer.fill(scenarioPrompts.comparison);
  await expect(submit).toBeEnabled();
  await submit.click();

  expect((await createResponsePromise).status()).toBe(202);
  const streamResponse = await streamResponsePromise;
  expect(streamResponse.status()).toBe(200);

  await expect(page.getByRole('tab')).toHaveCount(4);
  for (const response of fakeModelResponses) {
    const tabName = TAB_NAMES[response.slot];
    await page.getByRole('tab', { name: tabName, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: tabName })).toContainText(response.content);
  }

  await expect(page.getByRole('status').filter({ hasText: 'Procesando respuestas' })).toBeHidden();
  await expect(composer).toBeEditable();
  await streamResponse.finished();
});
