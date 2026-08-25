import type { Page, Response } from '@playwright/test';

import { RESPONSE_SLOT_LABELS } from '../src/features/conversations/types/conversation';
import { defaultDeploymentIds, deploymentSummaries, expect, test } from './fixtures/modelFuse';
import { expectDeploymentSummaries, waitForTurnStream } from './support/journeys';

const CREATE_CONVERSATION = /\/api\/v1\/conversations$/;
const CREATE_TURN = /\/api\/v1\/conversations\/[^/]+\/turns$/;
const EXPECTED_DEPLOYMENTS = deploymentSummaries(defaultDeploymentIds);

async function submitHistoryPrompt(
  page: Page,
  prompt: string,
  endpoint: RegExp,
  expectedStatus: 201 | 202
) {
  const responsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' && endpoint.test(new URL(response.url()).pathname)
  );
  const streamPromise = waitForTurnStream(page);

  const composer = page.getByRole('textbox', { name: 'Prompt' });
  await expect(composer).toBeEditable();
  await composer.fill(prompt);
  const submit = page.getByRole('button', { name: 'Enviar' });
  await expect(submit).toBeEnabled();
  await submit.click();

  const response = await responsePromise;
  expect(response.status()).toBe(expectedStatus);
  return {
    result: await response.json(),
    stream: await streamPromise,
  };
}

test('reopens only the latest three turns and prepends history in 3/3/1 blocks', async ({
  page,
  scenarioPrompts,
}) => {
  const owner = scenarioPrompts.comparison.slice(scenarioPrompts.comparison.indexOf('[run:'));
  const title = `Historial 3-3-1 ${owner}`;

  await page.goto('/');
  for (let ordinal = 1; ordinal <= 7; ordinal += 1) {
    const submission = await submitHistoryPrompt(
      page,
      ordinal === 1 ? title : `Mensaje histórico ${ordinal}`,
      ordinal === 1 ? CREATE_CONVERSATION : CREATE_TURN,
      ordinal === 1 ? 201 : 202
    );
    expect(submission.result.turn.ordinal).toBe(ordinal);
    expectDeploymentSummaries(submission.result, defaultDeploymentIds);
    await submission.stream.finished();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEditable();
  }

  await page.reload();
  const sidebar = page.getByRole('navigation', { name: 'Conversaciones' });
  const historyPageSizes: number[] = [];
  const historyCaptures: Promise<void>[] = [];
  const captureHistoryPage = (response: Response) => {
    if (
      response.request().method() !== 'GET' ||
      !/\/api\/v1\/conversations\/[^/]+\/turns$/.test(new URL(response.url()).pathname)
    ) {
      return;
    }
    historyCaptures.push(
      response.json().then((body: { items?: unknown }) => {
        if (Array.isArray(body.items)) historyPageSizes.push(body.items.length);
      })
    );
  };
  page.on('response', captureHistoryPage);
  await sidebar.getByRole('button', { name: title, exact: true }).click();

  const assignment = page.getByRole('region', { name: 'Deployments de la conversación' });
  for (const deployment of EXPECTED_DEPLOYMENTS) {
    await expect(
      assignment.getByText(RESPONSE_SLOT_LABELS[deployment.slot], { exact: true })
    ).toBeVisible();
    await expect(assignment.getByText(deployment.displayName, { exact: true })).toBeVisible();
  }
  await expect(assignment.getByRole('combobox')).toHaveCount(0);

  const history = page.getByRole('region', { name: 'Historial de conversación' });
  const turns = history.getByRole('article', { name: /Turno \d+/ });
  const latestTurn = history.getByRole('article', { name: 'Turno 7' });
  for (const deployment of EXPECTED_DEPLOYMENTS) {
    await expect(
      latestTurn.getByRole('tab', {
        name: `${RESPONSE_SLOT_LABELS[deployment.slot]} · ${deployment.displayName}`,
        exact: true,
      })
    ).toBeVisible();
  }

  await history.hover();
  await page.mouse.wheel(0, -10_000);
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
  await Promise.all(historyCaptures);
  page.off('response', captureHistoryPage);
  expect(historyPageSizes).toEqual([3, 3, 1]);
  await expect(history.getByRole('button', { name: /anterior|siguiente|página/i })).toHaveCount(0);
});
