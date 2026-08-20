import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DeploymentCatalogItem, DeploymentIds } from '../../types/conversation';
import { DeploymentSelectors } from '../DeploymentSelectors';

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

describe('DeploymentSelectors', () => {
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
