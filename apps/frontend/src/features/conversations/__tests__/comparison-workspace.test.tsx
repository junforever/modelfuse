import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConversationProcessingNotice } from '../components/ConversationProcessingNotice';
import { PromptComposer } from '../components/PromptComposer';
import { TurnCard } from '../components/TurnCard';
import {
  deploymentSummaries,
  eventTime,
  modelResponse,
  turnFixture,
} from '../../../test/conversation-fixtures';

describe('comparison workspace components', () => {
  it('keeps four labelled tabs and each response state isolated', async () => {
    const user = userEvent.setup();
    const turn = turnFixture({
      responses: [
        modelResponse('base-1', {
          status: 'completed',
          content: 'Respuesta exclusiva de OpenAI',
          completedAt: eventTime,
        }),
        modelResponse('base-2', {
          status: 'failed',
          error: { code: 'timeout', message: 'Google no respondió' },
          recoverable: true,
          completedAt: eventTime,
        }),
        modelResponse('base-3', {
          status: 'failed',
          error: { code: 'authentication', message: 'MiniMax no disponible' },
          recoverable: false,
          completedAt: eventTime,
        }),
        modelResponse('consolidator', { status: 'running' }),
      ],
    });

    render(
      <TurnCard
        turn={turn}
        deployments={deploymentSummaries}
        hasWorkInProgress={false}
        runtimeStages={{ consolidator: 'Consolidando…' }}
        onRetry={vi.fn()}
        onContinueWithout={vi.fn()}
      />
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.map(tab => tab.textContent)).toEqual([
      'Base 1 · Model 1',
      'Base 2 · Model 2',
      'Base 3 · Model 3',
      'Consolidador · Model 4',
    ]);
    expect(screen.getByRole('tabpanel', { name: 'Base 1 · Model 1' })).toHaveTextContent(
      'Respuesta exclusiva de OpenAI'
    );
    expect(screen.queryByText('Google no respondió')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Base 2 · Model 2' }));
    const googlePanel = screen.getByRole('tabpanel', { name: 'Base 2 · Model 2' });
    expect(googlePanel).toHaveTextContent('Google no respondió');
    expect(
      within(googlePanel).getByRole('button', { name: 'Reintentar Base 2 · Model 2' })
    ).toBeEnabled();
    expect(
      within(googlePanel).getByRole('button', { name: 'Continuar sin Base 2 · Model 2' })
    ).toBeEnabled();

    await user.click(screen.getByRole('tab', { name: 'Base 3 · Model 3' }));
    const minimaxPanel = screen.getByRole('tabpanel', { name: 'Base 3 · Model 3' });
    expect(minimaxPanel).toHaveTextContent('MiniMax no disponible');
    expect(
      within(minimaxPanel).queryByRole('button', { name: 'Reintentar Base 3 · Model 3' })
    ).not.toBeInTheDocument();
    expect(
      within(minimaxPanel).getByRole('button', { name: 'Continuar sin Base 3 · Model 3' })
    ).toBeEnabled();

    await user.click(screen.getByRole('tab', { name: 'Consolidador · Model 4' }));
    const qwenPanel = screen.getByRole('tabpanel', { name: 'Consolidador · Model 4' });
    expect(qwenPanel).toHaveTextContent('Consolidando…');
    expect(
      within(qwenPanel).queryByRole('button', { name: /Continuar sin/i })
    ).not.toBeInTheDocument();
  });

  it('disables work-producing controls while busy but keeps permanent exclusion available', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const continueWithout = vi.fn();
    const submit = vi.fn();
    const turn = turnFixture({
      responses: [
        modelResponse('base-1', {
          status: 'failed',
          error: { code: 'timeout', message: 'OpenAI no respondió' },
          recoverable: true,
          completedAt: eventTime,
        }),
        modelResponse('base-2'),
        modelResponse('base-3'),
        modelResponse('consolidator'),
      ],
    });

    render(
      <>
        <ConversationProcessingNotice isBusy sseError={null} />
        <TurnCard
          turn={turn}
          deployments={deploymentSummaries}
          hasWorkInProgress
          runtimeStages={{}}
          onRetry={retry}
          onContinueWithout={continueWithout}
        />
        <PromptComposer isBusy isPending={false} onSubmit={submit} />
      </>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Procesando respuestas');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reintentar Base 1 · Model 1' })).toBeDisabled();
    const continueButton = screen.getByRole('button', {
      name: 'Continuar sin Base 1 · Model 1',
    });
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);
    const dialog = screen.getByRole('dialog', { name: 'Continuar sin Base 1 · Model 1' });
    expect(dialog).toHaveTextContent(/permanente/i);
    expect(dialog).toHaveTextContent(/no podrás reintentar Base 1 · Model 1/i);
    const confirm = within(dialog).getByRole('button', {
      name: 'Confirmar continuar sin Base 1 · Model 1',
    });
    expect(confirm).toHaveFocus();

    await user.click(confirm);
    expect(continueWithout).toHaveBeenCalledOnce();
    expect(continueWithout).toHaveBeenCalledWith('base-1');
    expect(retry).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
