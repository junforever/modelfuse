import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { modelResponse } from '../../../../test/conversation-fixtures';
import { ResponsePanel } from '../ResponsePanel';

describe('ResponsePanel completed responses', () => {
  it.each(['base-1', 'base-2', 'base-3', 'consolidator'] as const)(
    'renders safe GFM semantics for %s',
    (slot) => {
      const content = [
        '## Heading',
        '',
        '**Bold**',
        '',
        '- List item',
        '',
        '[Link](https://example.com)',
        '',
        '> Quote',
        '',
        '`inline code`',
        '',
        '```ts',
        'const value = 1;',
        '```',
        '',
        '| Column A | Column B |',
        '| --- | --- |',
        '| Cell A | Cell B |',
        '',
        '~~Removed~~',
        '',
        '- [x] Done',
        '- [ ] Pending',
        '',
        'https://example.org user@example.com',
        '',
        'Footnote reference[^1]',
        '',
        '[^1]: Footnote body',
        '',
        '<div id="raw-div">Raw div</div>',
        '',
        '<script id="raw-script">window.evil = true</script>',
      ].join('\n');
      const { container } = render(
        <ResponsePanel
          response={modelResponse(slot, { status: 'completed', content })}
          responseLabel={slot}
          hasWorkInProgress={false}
          onRetry={vi.fn()}
          onContinueWithout={vi.fn()}
        />
      );

      expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeVisible();
      expect(screen.getByText('Bold').tagName).toBe('STRONG');
      expect(screen.getByText('List item').tagName).toBe('LI');
      expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute(
        'href',
        'https://example.com'
      );
      expect(container.querySelector('blockquote')).toHaveTextContent('Quote');
      expect(container.querySelector('code:not(pre code)')).toHaveTextContent('inline code');
      expect(container.querySelector('pre code')).toHaveTextContent('const value = 1;');

      const table = container.querySelector('table');
      expect(table).toBeInTheDocument();
      expect(table?.querySelector('thead')).toBeInTheDocument();
      expect(table?.querySelector('tbody')).toBeInTheDocument();
      expect(screen.getByText('Column A').tagName).toBe('TH');
      expect(screen.getByText('Cell A').tagName).toBe('TD');
      expect(screen.getByText('Removed').tagName).toBe('DEL');

      const taskItems = screen.getAllByRole('checkbox');
      expect(taskItems).toHaveLength(2);
      expect(taskItems[0]).toBeDisabled();
      expect(taskItems[0]).toBeChecked();
      expect(taskItems[1]).toBeDisabled();
      expect(taskItems[1]).not.toBeChecked();
      expect(screen.getByRole('link', { name: 'https://example.org' })).toHaveAttribute(
        'href',
        'https://example.org'
      );
      expect(screen.getByRole('link', { name: 'user@example.com' })).toHaveAttribute(
        'href',
        'mailto:user@example.com'
      );
      expect(container.querySelector('sup a')).toHaveTextContent('1');
      expect(container.querySelector('section')).toHaveTextContent('Footnote body');

      expect(container.querySelector('div#raw-div')).not.toBeInTheDocument();
      expect(container).toHaveTextContent('<div id="raw-div">Raw div</div>');
      expect(container.querySelector('script#raw-script')).not.toBeInTheDocument();
      expect(container).toHaveTextContent(
        '<script id="raw-script">window.evil = true</script>'
      );
    }
  );
});

describe('ResponsePanel copy action', () => {
  it('copies the full raw completed response while its rendered content is collapsed', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const content = 'Visible prefix and the exact hidden response tail.';

    render(
      <ResponsePanel
        response={modelResponse('base-1', { status: 'completed', content })}
        responseLabel="Base 1"
        hasWorkInProgress={false}
        collapseThreshold={14}
        onRetry={vi.fn()}
        onContinueWithout={vi.fn()}
      />
    );

    expect(screen.queryByText(content)).not.toBeInTheDocument();
    const copyAction = screen.getByRole('button', { name: 'Copiar' });
    expect(copyAction).not.toHaveTextContent('Copiar');
    const expansionAction = screen.getByRole('button', { name: 'Mostrar más' });
    expect(expansionAction.parentElement).toContainElement(copyAction);

    await user.hover(copyAction);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Copiar');

    await user.click(copyAction);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(content);
  });

  it('uses a theme-aware gradient while a response is pending or generating', () => {
    const { rerender } = render(
      <ResponsePanel
        response={modelResponse('base-1')}
        responseLabel="Base 1"
        hasWorkInProgress
        onRetry={vi.fn()}
        onContinueWithout={vi.fn()}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Generando respuesta…');
    expect(status).toHaveClass(
      'bg-linear-to-r',
      'from-blue-800',
      'via-cyan-700',
      'to-blue-800',
      'bg-size-[200%_100%]',
      'bg-clip-text',
      'text-transparent',
      'motion-safe:animate-response-shimmer',
      'dark:from-blue-300',
      'dark:via-cyan-200',
      'dark:to-blue-300'
    );
    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument();

    rerender(
      <ResponsePanel
        response={modelResponse('base-1', { status: 'pending' })}
        responseLabel="Base 1"
        hasWorkInProgress
        onRetry={vi.fn()}
        onContinueWithout={vi.fn()}
      />
    );
    expect(status).toHaveTextContent('En espera…');
  });
});

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
