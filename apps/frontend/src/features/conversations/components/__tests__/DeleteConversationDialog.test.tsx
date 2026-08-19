import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationSummary } from '../../types/conversation';
import { ConversationSidebar } from '../ConversationSidebar';

const onlyConversation: ConversationSummary = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'Única conversación',
  hasWorkInProgress: false,
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
};

describe('DeleteConversationDialog focus recovery', () => {
  it('moves focus to an existing destination after deleting the last conversation', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [conversations, setConversations] = useState([onlyConversation]);
      return (
        <ConversationSidebar
          conversations={conversations}
          hasMore={false}
          incrementalError={false}
          isError={false}
          isLoading={false}
          isLoadingMore={false}
          onDelete={vi.fn(async () => undefined)}
          onDeleted={() => setConversations([])}
          onLoadMore={vi.fn()}
          onNewConversation={vi.fn()}
          onRename={vi.fn(async () => onlyConversation)}
          onRetry={vi.fn()}
          onSelect={vi.fn()}
          selectedConversationId={onlyConversation.id}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Acciones de Única conversación' }));
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar conversación' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Nueva conversación' })).toHaveFocus();
  });
});
