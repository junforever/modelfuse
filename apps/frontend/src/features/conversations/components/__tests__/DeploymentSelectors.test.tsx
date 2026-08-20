import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DeploymentCatalogItem, DeploymentIds } from '../../types/conversation';
import {
  DeploymentSelectors,
  getDefaultDeploymentSelection,
} from '../DeploymentSelectors';

const emptySelection: DeploymentIds = {
  'base-1': '',
  'base-2': '',
  'base-3': '',
  consolidator: '',
};
const items = [
  deployment('deployment-1', 'GPT', 'openai'),
  deployment('deployment-2', 'Gemini', 'google'),
  deployment('deployment-3', 'MiniMax', 'openrouter'),
  deployment('deployment-4', 'Qwen', 'openrouter'),
] as const;
const defaultItems = [
  deployment('openai-5.6-sol', 'GPT-5.6 Sol', 'openai'),
  deployment('gemini-3.7-flash', 'Gemini 3.7 Flash', 'google'),
  deployment('openrouter-minimax-m3', 'MiniMax M3', 'openrouter'),
  deployment('openrouter-qwen-3.8-max', 'Qwen 3.8 Max', 'openrouter'),
] as const;

describe('DeploymentSelectors', () => {
  it('announces loading, empty, and error states without exposing a manual retry control', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DeploymentSelectors
        items={[]}
        selection={emptySelection}
        isLoading
        disabled={false}
        onChange={onChange}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Cargando deployments');
    expect(screen.getByRole('group', { name: 'Deployments' })).toBeDisabled();

    rerender(
      <DeploymentSelectors
        items={[]}
        selection={emptySelection}
        isLoading={false}
        disabled={false}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('No hay deployments disponibles');
    expect(screen.getByRole('group', { name: 'Deployments' })).toBeDisabled();

    rerender(
      <DeploymentSelectors
        items={[]}
        selection={emptySelection}
        isLoading={false}
        isError
        disabled={false}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo cargar el catálogo de deployments',
    );
    expect(screen.getByRole('group', { name: 'Deployments' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('labels four selectors and lets every canonical slot choose any catalog item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DeploymentSelectors
        items={items}
        selection={emptySelection}
        isLoading={false}
        disabled={false}
        onChange={onChange}
      />
    );
    const choices = [
      ['base-1', 'Base 1', 'deployment-4', 'Qwen · openrouter'],
      ['base-2', 'Base 2', 'deployment-3', 'MiniMax · openrouter'],
      ['base-3', 'Base 3', 'deployment-2', 'Gemini · google'],
      ['consolidator', 'Consolidador', 'deployment-1', 'GPT · openai'],
    ] as const;

    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    for (const [slot, label, deploymentId, optionName] of choices) {
      await user.click(screen.getByRole('combobox', { name: label }));
      const listbox = await screen.findByRole('listbox');
      expect(within(listbox).getAllByRole('option')).toHaveLength(items.length);
      for (const item of items) {
        expect(
          within(listbox).getByRole('option', {
            name: `${item.displayName} · ${item.providerId}`,
          }),
        ).toBeVisible();
      }
      await user.click(within(listbox).getByRole('option', { name: optionName }));
      expect(onChange).toHaveBeenLastCalledWith({
        ...emptySelection,
        [slot]: deploymentId,
      });
    }
  });

  it('shows the exact four defaults when the complete profile is available', () => {
    const selection = getDefaultDeploymentSelection(defaultItems);
    render(
      <DeploymentSelectors
        items={defaultItems}
        selection={selection}
        isLoading={false}
        disabled={false}
        onChange={vi.fn()}
      />
    );

    expect(selection).toEqual({
      'base-1': 'openai-5.6-sol',
      'base-2': 'gemini-3.7-flash',
      'base-3': 'openrouter-minimax-m3',
      consolidator: 'openrouter-qwen-3.8-max',
    });
    expect(screen.getByRole('combobox', { name: 'Base 1' })).toHaveTextContent('openai-5.6-sol');
    expect(screen.getByRole('combobox', { name: 'Base 2' })).toHaveTextContent('gemini-3.7-flash');
    expect(screen.getByRole('combobox', { name: 'Base 3' })).toHaveTextContent('openrouter-minimax-m3');
    expect(screen.getByRole('combobox', { name: 'Consolidador' })).toHaveTextContent('openrouter-qwen-3.8-max');
  });

  it('shows no partial defaults when any required deployment is missing', () => {
    const incompleteItems = defaultItems.filter(
      item => item.deploymentId !== 'openrouter-qwen-3.8-max',
    );
    const selection = getDefaultDeploymentSelection(incompleteItems);
    render(
      <DeploymentSelectors
        items={incompleteItems}
        selection={selection}
        isLoading={false}
        disabled={false}
        onChange={vi.fn()}
      />
    );

    expect(selection).toEqual(emptySelection);
    expect(screen.getByRole('status')).toHaveTextContent(
      'El perfil predeterminado no está disponible',
    );
    for (const selector of screen.getAllByRole('combobox')) {
      expect(selector).toHaveTextContent('Selecciona un deployment');
    }
  });

  it('announces when a selected deployment is no longer available', () => {
    render(
      <DeploymentSelectors
        items={items}
        selection={{ ...emptySelection, 'base-1': 'deployment-removed' }}
        isLoading={false}
        disabled={false}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Una selección ya no está disponible. Elige otro deployment para continuar.',
    );
    expect(screen.getByRole('group', { name: 'Deployments' })).toBeEnabled();
    expect(
      screen.queryByText('El perfil predeterminado no está disponible', { exact: false }),
    ).not.toBeInTheDocument();
  });
});

function deployment(
  deploymentId: string,
  displayName: string,
  providerId: DeploymentCatalogItem['providerId'],
): DeploymentCatalogItem {
  return {
    deploymentId,
    displayName,
    providerId,
    modelId: `${deploymentId}-model`,
    contextLimitTokens: 100_000,
    maxOutputTokens: 8_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
  };
}
