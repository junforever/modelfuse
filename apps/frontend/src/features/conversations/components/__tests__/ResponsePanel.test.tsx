import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { modelResponse } from '../../../../test/conversation-fixtures';
import { ResponsePanel } from '../ResponsePanel';

describe('ResponsePanel async failures', () => {
  it('announces a received slot error together with its recovery actions', async () => {
    const user = userEvent.setup();
    const props = {
      responseLabel: 'Base 1 · GPT-5.6 Sol',
      hasWorkInProgress: false,
      onRetry: vi.fn(),
      onContinueWithout: vi.fn(),
    };
    const { rerender } = render(<ResponsePanel response={modelResponse('base-1')} {...props} />);

    rerender(
      <ResponsePanel
        response={modelResponse('base-1', {
          status: 'failed',
          error: { code: 'timeout', message: 'El deployment tardó demasiado.' },
          recoverable: true,
        })}
        {...props}
      />
    );

    const alert = await screen.findByRole('alert');
    const safeMessage =
      'Falló el proveedor asignado a Base 1: se agotó el tiempo de espera del proveedor.';
    expect(alert).toHaveTextContent(safeMessage);
    expect(alert).not.toHaveTextContent('El deployment tardó demasiado.');
    const retry = screen.getByRole('button', {
      name: 'Reintentar Base 1 · GPT-5.6 Sol',
    });
    expect(retry).toHaveAccessibleDescription(safeMessage);
    expect(
      screen.getByRole('button', { name: 'Continuar sin Base 1 · GPT-5.6 Sol' })
    ).toHaveAccessibleDescription(safeMessage);

    await user.click(retry);
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(props.onRetry).toHaveBeenCalledWith('base-1');
  });
});
