import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { modelResponse, turnFixture } from '../../../test/conversation-fixtures';
import { TurnList } from '../components/TurnList';

describe('TurnList', () => {
  it('keeps each prompt and its four responses associated in a multi-turn timeline', () => {
    const turns = [
      turnFixture({
        id: 'turn-1',
        ordinal: 1,
        prompt: 'First prompt',
        responses: [
          modelResponse('openai', { status: 'completed', content: 'First OpenAI answer' }),
          modelResponse('google'),
          modelResponse('minimax'),
          modelResponse('qwen'),
        ],
      }),
      turnFixture({
        id: 'turn-2',
        ordinal: 2,
        prompt: 'Second prompt',
        responses: [
          modelResponse('openai', { status: 'completed', content: 'Second OpenAI answer' }),
          modelResponse('google'),
          modelResponse('minimax'),
          modelResponse('qwen'),
        ],
      }),
    ];

    render(
      <TurnList
        turns={turns}
        hasWorkInProgress={false}
        onRetry={vi.fn()}
        onContinueWithout={vi.fn()}
      />
    );

    const timeline = screen.getByRole('list', { name: 'Turnos de la conversación' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Turno 1');
    expect(items[0]).toHaveTextContent('First prompt');
    expect(items[0]).toHaveTextContent('First OpenAI answer');
    expect(items[0]).not.toHaveTextContent('Second OpenAI answer');
    expect(items[1]).toHaveTextContent('Turno 2');
    expect(items[1]).toHaveTextContent('Second prompt');
    expect(items[1]).toHaveTextContent('Second OpenAI answer');
    expect(items[1]).not.toHaveTextContent('First OpenAI answer');
  });
});
