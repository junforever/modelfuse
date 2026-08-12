import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { modelResponse } from '../../../../test/conversation-fixtures';
import { ResponsePanel } from '../ResponsePanel';

describe('ResponsePanel async failures', () => {
  it('announces a received slot error together with its recovery actions', async () => {
    const props = {
      modelLabel: 'OpenAI',
      hasWorkInProgress: false,
      onRetry: vi.fn(),
      onContinueWithout: vi.fn(),
    };
    const { rerender } = render(
      <ResponsePanel response={modelResponse('openai')} {...props} />
    );

    rerender(
      <ResponsePanel
        response={modelResponse('openai', {
          status: 'failed',
          error: { code: 'timeout', message: 'OpenAI tardó demasiado.' },
          recoverable: true,
        })}
        {...props}
      />
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('OpenAI tardó demasiado.');
    expect(screen.getByRole('button', { name: 'Reintentar OpenAI' })).toHaveAccessibleDescription(
      'OpenAI tardó demasiado.'
    );
    expect(
      screen.getByRole('button', { name: 'Continuar sin OpenAI' })
    ).toHaveAccessibleDescription('OpenAI tardó demasiado.');
  });
});
