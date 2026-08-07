import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppShell } from '../AppShell';

describe('AppShell', () => {
  it('provides named layout landmarks and moves keyboard focus to main content', async () => {
    const user = userEvent.setup();

    render(
      <AppShell
        sidebar={
          <nav aria-label="Conversaciones">
            <button type="button">Conversación actual</button>
          </nav>
        }
      >
        <h1>Comparar respuestas</h1>
      </AppShell>
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Conversaciones' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveAccessibleName('Contenido principal');

    await user.tab();
    const skipLink = screen.getByRole('link', { name: 'Saltar al contenido principal' });
    expect(skipLink).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(main).toHaveFocus();
  });
});
