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
      deploymentIds,
    });
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('disables submission while the conversation or mutation is busy', () => {
    const onSubmit = vi.fn();
    const view = render(<PromptComposer isBusy isPending={false} onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    view.rerender(<PromptComposer isBusy={false} isPending onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
