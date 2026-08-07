import { describe, expect, it } from 'vitest';

import { calculateTurnState } from '../turnState.js';

const slots = (
  openai: 'pending' | 'running' | 'completed' | 'failed',
  google: 'pending' | 'running' | 'completed' | 'failed',
  minimax: 'pending' | 'running' | 'completed' | 'failed',
  qwen: 'pending' | 'running' | 'completed' | 'failed',
) => [
  { slot: 'openai' as const, status: openai },
  { slot: 'google' as const, status: google },
  { slot: 'minimax' as const, status: minimax },
  { slot: 'qwen' as const, status: qwen },
];

describe('calculateTurnState', () => {
  it.each([
    {
      name: 'pending slot',
      responses: slots('pending', 'completed', 'failed', 'completed'),
      expected: { status: 'running', hasWorkInProgress: true },
    },
    {
      name: 'running slot',
      responses: slots('completed', 'running', 'completed', 'completed'),
      expected: { status: 'running', hasWorkInProgress: true },
    },
    {
      name: 'four current completions',
      responses: slots('completed', 'completed', 'completed', 'completed'),
      expected: { status: 'completed', hasWorkInProgress: false },
    },
    {
      name: 'useful result with a missing or failed slot',
      responses: slots('completed', 'failed', 'failed', 'failed'),
      expected: { status: 'partial', hasWorkInProgress: false },
    },
    {
      name: 'no useful result',
      responses: slots('failed', 'failed', 'failed', 'failed'),
      expected: { status: 'failed', hasWorkInProgress: false },
    },
  ])('derives $expected.status and busy from exactly four slots ($name)', ({ responses, expected }) => {
    expect(calculateTurnState(responses)).toEqual(expected);
  });
});
