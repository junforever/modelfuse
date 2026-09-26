import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromptComposer } from '../PromptComposer';

const stableRequestId = '423e4567-e89b-42d3-a456-426614174000';
const deploymentIds = {
  'base-1': 'deployment-1',
  'base-2': 'deployment-2',
  'base-3': 'deployment-3',
  consolidator: 'deployment-4',
} as const;

afterEach(() => vi.restoreAllMocks());

describe('PromptComposer', () => {
  it('keeps composition text-only and emits the trimmed prompt with creation deployment IDs', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(stableRequestId);

    const { container } = render(
      <PromptComposer
        isBusy={false}
        isPending={false}
        canUseWebSearch
        deploymentIds={deploymentIds}
        onSubmit={onSubmit}
      />
    );
    const prompt = screen.getByRole('textbox', { name: 'Prompt' });
    const submit = screen.getByRole('button', { name: 'Enviar' });

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(prompt.tagName).toBe('TEXTAREA');
    expect(container.querySelector('input[type="file"]')).toBeNull();

    await user.type(prompt, '   ');
    expect(submit).toBeDisabled();
    await user.clear(prompt);
    await user.type(prompt, '  Compara estas respuestas  ');
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      clientRequestId: stableRequestId,
      prompt: 'Compara estas respuestas',
      webSearchEnabled: false,
      deploymentIds,
    });
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('places an accessible web-search toggle immediately after Send in the same action row', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const view = render(
      <PromptComposer isBusy={false} isPending={false} canUseWebSearch onSubmit={onSubmit} />
    );

    const submit = screen.getByRole('button', { name: 'Enviar' });
    const toggle = screen.getByRole('switch', { name: 'Búsqueda web' });
    const actionRow = submit.parentElement;
    const controls = [...(actionRow?.children ?? [])];
    const submitIndex = controls.findIndex(control => control === submit || control.contains(submit));
    const toggleIndex = controls.findIndex(control => control === toggle || control.contains(toggle));

    expect(actionRow).toContainElement(toggle);
    expect(toggleIndex).toBe(submitIndex + 1);
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(toggle).toBeChecked();

    view.rerender(<PromptComposer isBusy isPending={false} canUseWebSearch onSubmit={onSubmit} />);
    const busyToggle = screen.getByRole('switch', { name: 'Búsqueda web' });
    expect(busyToggle).toHaveAttribute('aria-disabled', 'true');
    expect(busyToggle).toHaveAttribute('tabindex', '-1');
    expect(busyToggle).not.toBeChecked();

    view.rerender(
      <PromptComposer
        isBusy={false}
        isPending={false}
        canUseWebSearch={false}
        onSubmit={onSubmit}
      />
    );
    const unsupportedToggle = screen.getByRole('switch', { name: 'Búsqueda web' });
    expect(unsupportedToggle).toHaveAttribute('aria-disabled', 'true');
    expect(unsupportedToggle).toHaveAttribute('tabindex', '-1');
    expect(unsupportedToggle).not.toBeChecked();
  });

  it('disables submission while the conversation or mutation is busy', () => {
    const onSubmit = vi.fn();
    const view = render(
      <PromptComposer isBusy isPending={false} canUseWebSearch onSubmit={onSubmit} />
    );

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    const busyToggle = screen.getByRole('switch', { name: 'Búsqueda web' });
    expect(busyToggle).toHaveAttribute('aria-disabled', 'true');
    expect(busyToggle).toHaveAttribute('tabindex', '-1');
    expect(busyToggle).not.toBeChecked();

    view.rerender(
      <PromptComposer isBusy={false} isPending canUseWebSearch onSubmit={onSubmit} />
    );
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    const pendingToggle = screen.getByRole('switch', { name: 'Búsqueda web' });
    expect(pendingToggle).toHaveAttribute('aria-disabled', 'true');
    expect(pendingToggle).toHaveAttribute('tabindex', '-1');
    expect(pendingToggle).not.toBeChecked();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
