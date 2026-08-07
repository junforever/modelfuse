import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContextWindowNotice } from '../components/ContextWindowNotice';

describe('ContextWindowNotice', () => {
  it('announces bounded context without exposing technical measurements or limits', () => {
    const { rerender } = render(
      <ContextWindowNotice
        contextWindow={{
          truncated: true,
          firstIncludedOrdinal: 4,
          lastIncludedOrdinal: 9,
          protectionApplied: 'turn-window-and-truncate',
        }}
      />,
    );

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/ventana acotada del contexto/i);
    expect(notice).not.toHaveTextContent(/tokens?|80%|turn-window|4|9/i);

    rerender(
      <ContextWindowNotice
        contextWindow={{
          truncated: false,
          firstIncludedOrdinal: 1,
          lastIncludedOrdinal: 1,
          protectionApplied: 'none',
        }}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
