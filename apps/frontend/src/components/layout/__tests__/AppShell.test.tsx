import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@workspace/ui/components/theme-provider';

import { AppShell } from '../AppShell';

const THEME_STORAGE_KEY = 'app-shell-theme-toggle-test';

function renderThemedAppShell(systemTheme: 'dark' | 'light') {
  const user = userEvent.setup();

  vi.stubGlobal('matchMedia', () => ({
    matches: systemTheme === 'dark',
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  render(
    <ThemeProvider
      defaultTheme="system"
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange={false}
    >
      <AppShell sidebar={<nav aria-label="Conversaciones" />}>
        <h1>Comparar respuestas</h1>
      </AppShell>
    </ThemeProvider>
  );

  return user;
}

function expectThemeButton(label: string, icon: 'moon' | 'sun') {
  const button = screen.getByRole('button', { name: label });

  expect(button).toHaveAttribute('aria-label', label);
  expect(button).toHaveAttribute('title', label);
  const iconSvg = button.querySelector('svg');
  expect(iconSvg).toBeInTheDocument();

  if (icon === 'sun') {
    expect(iconSvg?.querySelector('circle[cx="12"][cy="12"][r="4"]')).toBeInTheDocument();
  } else {
    expect(iconSvg?.querySelector('circle')).toBeNull();
    expect(iconSvg?.querySelectorAll('path')).toHaveLength(1);
  }

  return button;
}

describe('AppShell', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('dark', 'light');
    vi.unstubAllGlobals();
  });

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

  it('shows an accessible sun control when the effective theme is dark', () => {
    renderThemedAppShell('dark');

    expectThemeButton('Cambiar a modo claro', 'sun');
  });

  it('shows an accessible moon control when the effective theme is light', () => {
    renderThemedAppShell('light');

    expectThemeButton('Cambiar a modo oscuro', 'moon');
  });

  it('toggles the theme from the header control', async () => {
    const user = renderThemedAppShell('dark');

    await user.click(expectThemeButton('Cambiar a modo claro', 'sun'));

    expectThemeButton('Cambiar a modo oscuro', 'moon');
  });

  it('does not toggle the theme when d is pressed globally', async () => {
    const user = renderThemedAppShell('dark');

    expectThemeButton('Cambiar a modo claro', 'sun');
    await user.keyboard('d');

    expectThemeButton('Cambiar a modo claro', 'sun');
  });
});
