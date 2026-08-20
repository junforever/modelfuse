import { describe, expect, it } from 'vitest';

import { calculateTurnState } from '../turnState.js';
import { recoveryCases } from './fixtures/recoveryCases.js';

const slots = (
  base1: 'pending' | 'running' | 'completed' | 'failed',
  base2: 'pending' | 'running' | 'completed' | 'failed',
  base3: 'pending' | 'running' | 'completed' | 'failed',
  consolidator: 'pending' | 'running' | 'completed' | 'failed',
) => [
  { slot: 'base-1' as const, status: base1 },
  { slot: 'base-2' as const, status: base2 },
  { slot: 'base-3' as const, status: base3 },
  { slot: 'consolidator' as const, status: consolidator },
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
      name: 'stale completion excluded from useful results',
      responses: slots('completed', 'failed', 'failed', 'completed').map(response =>
        response.slot === 'consolidator' ? { ...response, isStale: true } : response,
      ),
      expected: { status: 'partial', hasWorkInProgress: false },
    },
  ])('derives $expected.status and busy from exactly four slots ($name)', ({ responses, expected }) => {
    expect(calculateTurnState(responses)).toEqual(expected);
  });

  it('preserves the fixture recovery decisions after interrupted canonical slots become failed', () => {
    const decisions = recoveryCases.flatMap(recoveryCase =>
      recoveryCase.turns.map(turn => ({
        turnId: turn.id,
        actual: calculateTurnState(turn.responses.map(response => ({
          slot: response.slot,
          status: response.status === 'pending' || response.status === 'running'
            ? 'failed'
            : response.status,
        }))).status,
        expected: turn.expectedStatus,
      })),
    );

    expect(decisions.map(({ actual }) => actual)).toEqual(
      decisions.map(({ expected }) => expected),
    );
  });
});
