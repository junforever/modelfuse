import { expect, test } from './fixtures/modelFuse';
import { submitPrompt } from './support/journeys';

const CREATE_CONVERSATION = /\/api\/v1\/conversations$/;
const CREATE_TURN = /\/api\/v1\/conversations\/[^/]+\/turns$/;

test('reopens only the latest three turns and prepends history in 3/3/1 blocks', async ({
  page,
  scenarioPrompts,
}) => {
  const owner = scenarioPrompts.comparison.slice(scenarioPrompts.comparison.indexOf('[run:'));
  const title = `Historial 3-3-1 ${owner}`;

  await page.goto('/');
  for (let ordinal = 1; ordinal <= 7; ordinal += 1) {
    const submission = await submitPrompt(
      page,
      ordinal === 1 ? title : `Mensaje histórico ${ordinal}`,
      ordinal === 1 ? CREATE_CONVERSATION : CREATE_TURN
    );
    expect(submission.result.turn.ordinal).toBe(ordinal);
    await submission.stream.finished();
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  }

  await page.reload();
  const sidebar = page.getByRole('navigation', { name: 'Conversaciones' });
  await sidebar.getByRole('button', { name: title, exact: true }).click();

  const history = page.getByRole('region', { name: 'Historial de conversación' });
  const turns = history.getByRole('article', { name: /Turno \d+/ });
  await expect(turns).toHaveText([/Turno 5/, /Turno 6/, /Turno 7/]);
  await expect(history.getByRole('article', { name: 'Turno 4' })).toHaveCount(0);

  await history.hover();
  await page.mouse.wheel(0, -10_000);
  await expect(turns).toHaveText([
    /Turno 2/,
    /Turno 3/,
    /Turno 4/,
    /Turno 5/,
    /Turno 6/,
    /Turno 7/,
  ]);

  await page.mouse.wheel(0, -10_000);
  await expect(turns).toHaveText([
    /Turno 1/,
    /Turno 2/,
    /Turno 3/,
    /Turno 4/,
    /Turno 5/,
    /Turno 6/,
    /Turno 7/,
  ]);
  await expect(history.getByRole('button', { name: /anterior|siguiente|página/i })).toHaveCount(0);
});
