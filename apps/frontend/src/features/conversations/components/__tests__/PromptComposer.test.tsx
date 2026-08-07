import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromptComposer } from '../PromptComposer';

const stableRequestId = '423e4567-e89b-42d3-a456-426614174000';

afterEach(() => vi.restoreAllMocks());

describe('PromptComposer', () => {
  it('trims a valid prompt and generates exactly one stable UUID for the logical submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue(stableRequestId);

    render(<PromptComposer isBusy={false} isPending={false} onSubmit={onSubmit} />);
    const prompt = screen.getByRole('textbox', { name: 'Prompt' });
    const submit = screen.getByRole('button', { name: 'Enviar' });

    await user.type(prompt, '   ');
    expect(submit).toBeDisabled();
    await user.clear(prompt);
    await user.type(prompt, '  Compara estas respuestas  ');
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      clientRequestId: stableRequestId,
      prompt: 'Compara estas respuestas',
    });
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('disables submission while the conversation or mutation is busy', () => {
    const onSubmit = vi.fn();
    const view = render(
      <PromptComposer isBusy isPending={false} onSubmit={onSubmit} />
    );

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    view.rerender(<PromptComposer isBusy={false} isPending onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
