import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../../App';
import { eventTime } from '../../../test/conversation-fixtures';
import { ControlledIntersectionObserver } from '../../../test/controlledIntersectionObserver';
import { renderWithQueryClient } from '../../../test/query-test-utils';
import { CollapsibleHistoryMessage } from '../components/CollapsibleHistoryMessage';
import type { ConversationSummary } from '../types/conversation';

const api = vi.hoisted(() => ({
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  listConversationTurns: vi.fn(),
  listConversations: vi.fn(),
  renameConversation: vi.fn(),
}));

vi.mock('../api/conversationsApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/conversationsApi')>()),
  ...api,
}));

const FIRST_ID = 'd0000000-0000-4000-8000-000000000093';
const SECOND_ID = 'd0000000-0000-4000-8000-000000000094';

describe('conversation management frontend integration', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset());
    ControlledIntersectionObserver.reset();
    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver);
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1');
    vi.stubEnv('VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD', '20');
    api.getConversation.mockImplementation(async (_client, id: string) =>
      conversation(id === FIRST_ID ? 'Primera' : 'Segunda', false, id)
    );
    api.listConversationTurns.mockResolvedValue({ items: [], olderCursor: null, hasOlder: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows special and HTML-looking titles as literal text without creating markup', async () => {
    const title = `"<img src=x onerror=alert(1)>" café 😀 👨‍👩‍👧‍👦 e\u0301`;
    api.listConversations.mockResolvedValue({
      items: [conversation(title, false, FIRST_ID)],
      nextCursor: null,
    });
    const { container, queryClient, unmount } = renderWithQueryClient(<App />);

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    unmount();
    queryClient.clear();
  });

  it('opens the menu/dialog with focus and counts Unicode graphemes at the 80/81 boundary', async () => {
    api.listConversations.mockResolvedValue({
      items: [conversation('Título inicial', false, FIRST_ID)],
      nextCursor: null,
    });
    const user = userEvent.setup();
    const { queryClient, unmount } = renderWithQueryClient(<App />);
    const menuTrigger = await screen.findByRole('button', { name: 'Acciones de Título inicial' });

    await user.click(menuTrigger);
    await user.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Renombrar', 'Eliminar']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Renombrar' }));

    const dialog = screen.getByRole('dialog', { name: 'Renombrar conversación' });
    const input = within(dialog).getByRole('textbox', { name: 'Nombre de la conversación' });
    const counter = within(dialog).getByRole('status', { name: 'Longitud del título' });
    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    expect(input).toHaveFocus();

    for (const [value, count] of [
      ['A', 1],
      ['😀', 1],
      ['👨‍👩‍👧‍👦', 1],
      [`e\u0301`, 1],
      [`A😀👨‍👩‍👧‍👦e\u0301ñ`, 5],
    ] as const) {
      fireEvent.change(input, { target: { value } });
      expect(counter).toHaveTextContent(`${count}/80`);
      expect(save).toBeEnabled();
    }

    const eighty = `${'a'.repeat(79)}👨‍👩‍👧‍👦`;
    fireEvent.change(input, { target: { value: eighty } });
    expect(counter).toHaveTextContent('80/80');
    expect(save).toBeEnabled();

    fireEvent.change(input, { target: { value: `${eighty}e\u0301` } });
    expect(counter).toHaveTextContent('81/80');
    expect(save).toBeDisabled();
    expect(api.renameConversation).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  });

  it('prevents duplicate rename, preserves the dialog on error and applies the canonical success', async () => {
    let items = [conversation('Título inicial', false, FIRST_ID)];
    const failed = deferred<ConversationSummary>();
    const succeeded = deferred<ConversationSummary>();
    api.listConversations.mockImplementation(async () => ({ items, nextCursor: null }));
    api.renameConversation
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(succeeded.promise);
    const user = userEvent.setup();
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    const trigger = await screen.findByRole('button', { name: 'Acciones de Título inicial' });
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    const dialog = screen.getByRole('dialog', { name: 'Renombrar conversación' });
    const input = within(dialog).getByRole('textbox', { name: 'Nombre de la conversación' });
    await user.clear(input);
    await user.type(input, `  Nuevo "<b>" café 😀  `);
    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    await user.dblClick(save);

    expect(api.renameConversation).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();
    await act(async () => {
      failed.reject(new Error('raw transport detail'));
      await expect(failed.promise).rejects.toThrow('raw transport detail');
    });
    expect(dialog).toBeInTheDocument();
    expect(input).toHaveValue(`  Nuevo "<b>" café 😀  `);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No se pudo renombrar');
    expect(screen.getByText('Título inicial')).toBeInTheDocument();

    const canonical = conversation(`Nuevo "<b>" café 😀`, false, FIRST_ID);
    items = [canonical];
    await user.click(save);
    await act(async () => {
      succeeded.resolve(canonical);
      await succeeded.promise;
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(canonical.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Acciones de ${canonical.title}` })).toHaveFocus();
    unmount();
    queryClient.clear();
  });

  it('disables Delete while busy but leaves Rename enabled with an accessible reason', async () => {
    api.listConversations.mockResolvedValue({
      items: [conversation('Procesando', true, FIRST_ID)],
      nextCursor: null,
    });
    const user = userEvent.setup();
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    await user.click(await screen.findByRole('button', { name: 'Acciones de Procesando' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Renombrar' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    const deleteItem = screen.getByRole('menuitem', { name: 'Eliminar' });
    const busyReason = screen.getByText(/no puedes eliminar mientras se procesan respuestas/i);
    expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
    expect(busyReason).toHaveAttribute('id');
    expect(deleteItem).toHaveAttribute('aria-describedby', busyReason.id);
    for (const descriptionId of deleteItem
      .getAttribute('aria-describedby')!
      .split(/\s+/)
      .filter(Boolean)) {
      expect(document.getElementById(descriptionId)).toBe(busyReason);
    }
    expect(api.deleteConversation).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  });

  it('prevents duplicate Delete, keeps data on error and removes it on canonical success', async () => {
    let items = [
      conversation('Primera', false, FIRST_ID),
      conversation('Segunda', false, SECOND_ID),
    ];
    const failed = deferred<void>();
    const succeeded = deferred<void>();
    api.listConversations.mockImplementation(async () => ({ items, nextCursor: null }));
    api.deleteConversation
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(succeeded.promise);
    const user = userEvent.setup();
    const { queryClient, unmount } = renderWithQueryClient(<App />);

    await user.click(await screen.findByRole('button', { name: 'Acciones de Primera' }));
    await user.keyboard('{ArrowDown}');
    const deleteItem = screen.getByRole('menuitem', { name: 'Eliminar' });
    expect(deleteItem).not.toHaveAttribute('aria-describedby');
    expect(
      screen.queryByText(/no puedes eliminar mientras se procesan respuestas/i)
    ).not.toBeInTheDocument();
    await user.click(deleteItem);
    const dialog = screen.getByRole('dialog', { name: 'Eliminar conversación' });
    const confirm = within(dialog).getByRole('button', { name: 'Eliminar' });
    await waitFor(() => expect(confirm).toHaveFocus());
    await user.dblClick(confirm);

    expect(api.deleteConversation).toHaveBeenCalledOnce();
    expect(confirm).toBeDisabled();
    await act(async () => {
      failed.reject(new Error('raw transport detail'));
      await expect(failed.promise).rejects.toThrow('raw transport detail');
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Primera')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No se pudo eliminar');

    items = items.slice(1);
    await user.click(confirm);
    await act(async () => {
      succeeded.resolve();
      await succeeded.promise;
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Primera')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Segunda$/ })).toHaveFocus();
    unmount();
    queryClient.clear();
  });

  it('collapses long historical content locally without network work', async () => {
    const user = userEvent.setup();
    const content = 'Mensaje histórico largo que debe conservarse de forma literal';
    render(<CollapsibleHistoryMessage content={content} threshold={20} />);

    expect(screen.queryByText(content)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar más' }));
    expect(screen.getByText(content)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar menos' }));
    expect(screen.queryByText(content)).not.toBeInTheDocument();
    expect(Object.values(api).every(mock => mock.mock.calls.length === 0)).toBe(true);
  });
});

function conversation(title: string, hasWorkInProgress: boolean, id: string): ConversationSummary {
  return { id, title, hasWorkInProgress, createdAt: eventTime, updatedAt: eventTime };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
