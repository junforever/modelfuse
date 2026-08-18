---
name: playwright-e2e-authoring
description: Implement and maintain resilient browser end-to-end tests with Playwright Test and TypeScript. Use when converting an approved E2E journey into code, selecting user-facing locators and web-first assertions, defining Playwright fixtures and setup boundaries, organizing specs and projects, handling browser contexts or authentication state, or reviewing Playwright tests for brittle selectors, unnecessary mocks, weak assertions, and misuse of the test runner.
---

# Playwright E2E Authoring

Translate an approved E2E design contract into the smallest readable Playwright test that exercises the real user journey.

## Authoring Workflow

### 1. Confirm the design contract

Load `e2e-test-design` first for every new journey. Require a clear layer decision, one user intention, minimum preconditions, observable oracles, controlled boundaries, and cleanup ownership.

Do not write Playwright code when the layer decision assigns the behavior to unit or integration testing.

### 2. Inspect the installed test surface

Before editing:

- Read the repository instructions, package manager files, installed Playwright version, `playwright.config.*`, existing specs, fixtures, setup/teardown, scripts, and environment examples.
- Reuse the configured `testDir`, `baseURL`, projects, reporters, web server, output directory, and fixture conventions.
- Consult official documentation for the installed version when API behavior is uncertain.
- Avoid dependency upgrades, new packages, browser projects, reporters, and global hooks unless explicitly required.

### 3. Place the test consistently

- Follow the repository's existing E2E directory and filename convention.
- Group tests by product journey or capability, not by implementation component.
- Use a title that states the user-observable result.
- Keep one coherent user intention in each `test()`.
- Use `test.describe()` only for genuinely shared context, configuration, or lifecycle.
- Use `test.step()` only when a longer journey benefits from diagnostic phases; do not wrap every action.

### 4. Start with direct Playwright APIs

Prefer a direct test until repeated code justifies a fixture or helper:

```ts
import { expect, test } from '@playwright/test';

test('persists the confirmed title after reload', async ({ page }) => {
  await page.goto('/conversations/123');
  await page.getByRole('button', { name: 'Conversation actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByLabel('Conversation name').fill('Release review');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('link', { name: 'Release review' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Release review' })).toBeVisible();
});
```

Keep the sequence readable as user actions plus observable checkpoints. Do not hide a five-line journey behind a framework.

## Locator Rules

Select elements through their user-facing contract, in this order when applicable:

1. `getByRole()` with an accessible name.
2. `getByLabel()` for form controls.
3. `getByPlaceholder()` when the placeholder is the actual stable product surface.
4. `getByText()` for unique visible content.
5. `getByTestId()` only when no stable semantic locator exists.

Additional rules:

- Scope with a meaningful parent locator when repeated content makes a locator ambiguous.
- Let locator strictness reveal ambiguous product or test design; do not silence it with `.first()`, `.last()`, or `.nth()` unless order is itself part of the contract.
- Avoid generated CSS classes, Tailwind utilities, XPath, DOM ancestry, React internals, and selectors tied to layout.
- Do not add a production `data-testid` when an accessible name would improve both usability and testability; report that change to the frontend builder.
- Reuse a locator variable only when it improves intent or is asserted more than once.

## Action Rules

- Use locator actions such as `click()`, `fill()`, `press()`, `check()`, and `selectOption()`.
- Rely on Playwright actionability checks instead of manually waiting for visibility before every action.
- Do not use `force: true` to bypass an overlap, disabled state, or broken interaction unless bypassing actionability is the explicit scenario.
- Do not manipulate DOM or application state through `page.evaluate()` to imitate a normal user action.
- Use keyboard interaction when keyboard behavior or focus management belongs to the requirement.
- Keep navigation relative to configured `baseURL` when the repository supports it.

## Assertion Rules

Use Playwright's async, web-first assertions:

- `await expect(locator).toBeVisible()`
- `await expect(locator).toBeHidden()`
- `await expect(locator).toBeEnabled()` or `toBeDisabled()`
- `await expect(locator).toHaveText()` or `toContainText()`
- `await expect(locator).toHaveCount()`
- `await expect(page).toHaveURL()`
- `await expect(page).toHaveTitle()`

Assert the final product outcome and only the intermediate states needed to prove sequencing or prevent false positives.

- Prefer semantic state and visible copy over CSS or screenshots.
- Avoid raw `isVisible()`, `textContent()`, or attribute reads followed by immediate generic assertions when a web-first matcher exists.
- Make negative assertions conditional on a proven successful setup so they cannot pass because the page failed to load.
- Verify persistence with reload, reopen, or a separate context only when required.
- Verify isolation by asserting both presence at the origin and absence at the unrelated destination.

## Fixtures and Hooks

Create a fixture only for repeated setup, teardown, or a typed capability with a real lifecycle.

```ts
import { test as base } from '@playwright/test';

type Fixtures = {
  conversationId: string;
};

export const test = base.extend<Fixtures>({
  conversationId: async ({ request }, use) => {
    const response = await request.post('/api/test-support/conversations');
    const { id } = (await response.json()) as { id: string };
    await use(id);
    await request.delete(`/api/test-support/conversations/${id}`);
  },
});
```

- Keep mutable data test-scoped by default.
- Use worker scope only for resources safe to share across tests in that worker.
- Assign unique accounts or data by `parallelIndex` when worker-scoped state can mutate server data.
- Put teardown after `await use(...)` and make it idempotent.
- Avoid automatic fixtures that add cost or state to tests that do not use them.
- Prefer fixtures over large `beforeEach` hooks with hidden behavior.
- Use `beforeAll` only for immutable or safely isolated worker/file setup; never share mutable page state between tests.
- Use the `request` fixture for safe preconditions, not to replace the browser action under test.

Do not invent test-support endpoints. Use only an existing, environment-restricted boundary; otherwise report the required setup capability.

## Browser Context and Authentication

- Use Playwright's isolated context per test by default.
- Use additional contexts for multi-session, permission, or isolation scenarios.
- Reuse `storageState` only when authentication itself is not under test.
- Keep stored authentication state out of source control and test artifacts containing secrets.
- Use unique accounts per worker for tests that mutate shared server-side state.
- Close manually created contexts and pages in teardown.

## Network and External Dependencies

- Keep requests between the application frontend and its backend real in a full-stack E2E test.
- Route or fake only uncontrollable external systems at the project's supported boundary.
- Register a response or event wait before the action that triggers it:

```ts
const responsePromise = page.waitForResponse(
  response => response.url().endsWith('/turns') && response.request().method() === 'POST',
);
await page.getByRole('button', { name: 'Send' }).click();
await responsePromise;
```

- Assert the UI result after the response; a successful request alone does not prove the journey.
- Do not encode provider secrets or call paid production services.
- Avoid broad route patterns that accidentally mock unrelated requests.

## Configuration Discipline

- Preserve existing projects and browser coverage.
- Configure `trace`, `screenshot`, and `video` primarily for failure diagnosis, following existing CI/storage constraints.
- Keep `baseURL`, `webServer`, timeouts, retries, workers, and reporters centralized in the existing Playwright config.
- Apply `test.use()` or project overrides only to the narrow scope that needs them.
- Do not increase global timeouts or retries to compensate for a test defect.
- Do not switch a suite to serial execution merely to hide shared-state collisions.
- Annotate deliberate skips with a concrete environment capability or blocker and a follow-up owner; never use skip as a substitute for fixing a regression.

Exact command and launcher requirements are governed by the `e2e-test-runner`
core; this skill focuses on Playwright configuration semantics and authoring.

## Reuse Rules

Extract only after repetition appears:

- Use a function for a repeated stateless user operation.
- Use a fixture for repeated setup/teardown or lifecycle-managed state.
- Use a small page/domain object for repeated meaningful user intentions across multiple specs.
- Name abstractions after user actions such as `startConversation()`, not wrappers such as `clickButton()`.

Do not create base page classes, generic element wrappers, selector registries, custom assertion DSLs, or helpers for a single call site.

## Execution Workflow

1. Implement the smallest spec from the design contract.
2. Run the single test by file and title when useful.
3. Fix authoring defects within E2E-owned files.
4. Run the relevant configured project.
5. Run the broader E2E group only when change risk justifies it.
6. Record the exact command, project/browser, result, retries, and failure artifacts.
7. Return product defects to the owning builder without modifying production code.

## Authoring Review

Reject or revise a test that:

- Lacks an approved E2E layer decision.
- Uses brittle selectors or implementation details.
- Replaces the application's own API with mocks.
- Asserts only HTTP success without the browser-visible outcome.
- Uses fixed sleeps, forced actions, arbitrary retries, or oversized timeouts.
- Shares mutable state without worker/test isolation.
- Performs broad or unsafe cleanup.
- Contains multiple unrelated user intentions.
- Introduces an abstraction with one consumer.
- Modifies production code to make the test pass.
