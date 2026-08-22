import { describe, expect, it } from 'vitest';

import { applyConversationEvent } from '../conversation-cache';
import type { DeploymentSummaryTuple, ModelResponse, ResponseSlot } from '../../types/conversation';
import type { TurnEvent, TurnEventSnapshot } from '../../types/sse';

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const turnId = '223e4567-e89b-42d3-a456-426614174000';
const updatedAt = '2026-07-26T20:00:01.000Z';
const deployments: DeploymentSummaryTuple = [
  {
    slot: 'base-1',
    deploymentId: 'openai-5.6-sol',
    providerId: 'openai',
    modelId: 'gpt-5.6',
    displayName: 'GPT-5.6 Sol',
  },
  {
    slot: 'base-2',
    deploymentId: 'gemini-3.7-flash',
    providerId: 'google',
    modelId: 'gemini-3.7-flash',
    displayName: 'Gemini 3.7 Flash',
  },
  {
    slot: 'base-3',
    deploymentId: 'openrouter-minimax-m3',
    providerId: 'openrouter',
    modelId: 'minimax/m3',
    displayName: 'MiniMax M3',
  },
  {
    slot: 'consolidator',
    deploymentId: 'openrouter-qwen-3.8-max',
    providerId: 'openrouter',
    modelId: 'qwen/qwen-3.8-max',
    displayName: 'Qwen 3.8 Max',
  },
];

const responseIdentity: Readonly<Record<ResponseSlot, { provider: string; model: string }>> = {
  'base-1': { provider: 'openai', model: 'gpt-5.6' },
  'base-2': { provider: 'google', model: 'gemini-3.7-flash' },
  'base-3': { provider: 'openrouter', model: 'minimax/m3' },
  consolidator: { provider: 'openrouter', model: 'qwen/qwen-3.8-max' },
};

function response<Slot extends ResponseSlot>(slot: Slot): ModelResponse<Slot> {
  const identity = responseIdentity[slot];
  return {
    slot,
    role: slot === 'consolidator' ? 'consolidator' : 'base',
    provider: identity.provider,
    model: identity.model,
    status: 'running',
    content: null,
    error: null,
    recoverable: false,
    continuedWithout: false,
    isStale: false,
    attemptNo: 2,
    metadata: null,
    startedAt: updatedAt,
    completedAt: null,
    createdAt: updatedAt,
    updatedAt,
  } as ModelResponse<Slot>;
}

function snapshot(): TurnEventSnapshot {
  return {
    conversationId,
    turnId,
    deployments,
    turn: {
      id: turnId,
      clientRequestId: '323e4567-e89b-42d3-a456-426614174000',
      ordinal: 1,
      prompt: 'Compare this',
      status: 'running',
      responses: [
        response('base-1'),
        response('base-2'),
        response('base-3'),
        response('consolidator'),
      ],
      createdAt: updatedAt,
      updatedAt,
    },
    hasWorkInProgress: true,
    updatedAt,
    lastEventSequence: 10,
  };
}

function slotUpdate(overrides: {
  eventSequence: number;
  updatedAt?: string;
  attemptNo?: number;
}): Extract<TurnEvent, { event: 'slot_update' }> {
  return {
    event: 'slot_update',
    data: {
      conversationId,
      turnId,
      eventSequence: overrides.eventSequence,
      response: {
        ...response('base-1'),
        updatedAt: overrides.updatedAt ?? updatedAt,
        attemptNo: overrides.attemptNo ?? 2,
        status: 'completed',
        content: 'canonical result',
        completedAt: overrides.updatedAt ?? updatedAt,
      },
      runtimeStage: 'must stay local',
    },
  };
}

describe('conversation SSE cache updates', () => {
  it('applies only canonical slot, turn and busy fields and never stores runtimeStage', () => {
    const withSlot = applyConversationEvent(snapshot(), slotUpdate({ eventSequence: 11 }));
    const withTurn = applyConversationEvent(withSlot, {
      event: 'turn_update',
      data: {
        conversationId,
        turnId,
        eventSequence: 12,
        turn: { id: turnId, status: 'completed', updatedAt },
      },
    });
    const terminal = applyConversationEvent(withTurn, {
      event: 'busy_update',
      data: {
        conversationId,
        turnId,
        eventSequence: 13,
        hasWorkInProgress: false,
        updatedAt,
      },
    });

    expect(terminal.turn.responses[0]).toMatchObject({
      slot: 'base-1',
      status: 'completed',
      content: 'canonical result',
    });
    expect(terminal.turn).toMatchObject({ status: 'completed', updatedAt });
    expect(terminal).toMatchObject({
      deployments,
      hasWorkInProgress: false,
      updatedAt,
      lastEventSequence: 13,
    });
    expect(terminal).not.toHaveProperty('runtimeStage');
    expect(terminal.turn.responses[0]).not.toHaveProperty('runtimeStage');
    expect(terminal.deployments).toBe(deployments);
  });

  it('ignores old or duplicate slot version tuples without changing cache identity', () => {
    const current = snapshot();
    const staleEvents = [
      slotUpdate({ eventSequence: 11, updatedAt: '2026-07-26T20:00:00.000Z' }),
      slotUpdate({ eventSequence: 11, attemptNo: 1 }),
      slotUpdate({ eventSequence: 10 }),
    ];

    for (const event of staleEvents) {
      expect(applyConversationEvent(current, event)).toBe(current);
    }
  });

  it('accepts a consecutive slot change when timestamp and attempt tie but sequence grows', () => {
    const current = snapshot();
    const next = applyConversationEvent(current, slotUpdate({ eventSequence: 11 }));

    expect(next).not.toBe(current);
    expect(next.lastEventSequence).toBe(11);
    expect(next.turn.responses[0]).toMatchObject({
      attemptNo: 2,
      updatedAt,
      status: 'completed',
      content: 'canonical result',
    });
    expect(applyConversationEvent(next, slotUpdate({ eventSequence: 11 }))).toBe(next);
  });
});
