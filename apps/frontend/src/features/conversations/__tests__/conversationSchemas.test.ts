import { describe, expect, it } from 'vitest';

import {
  turnEventSchema,
  turnEventSnapshotSchema,
  turnSnapshotResponseSchema,
} from '../schemas/conversationSchemas';

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const turnId = '223e4567-e89b-42d3-a456-426614174000';
const clientRequestId = '323e4567-e89b-42d3-a456-426614174000';
const updatedAt = '2026-07-26T20:00:01.000Z';

function response(slot: 'openai' | 'google' | 'minimax' | 'qwen') {
  return {
    slot,
    role: slot === 'qwen' ? 'consolidator' : 'base',
    provider: slot,
    model: `${slot}-model`,
    status: 'completed',
    content: `${slot} response`,
    error: null,
    recoverable: false,
    continuedWithout: false,
    isStale: false,
    attemptNo: 1,
    metadata: null,
    startedAt: '2026-07-26T20:00:00.000Z',
    completedAt: updatedAt,
    createdAt: '2026-07-26T20:00:00.000Z',
    updatedAt,
  };
}

const turn = {
  id: turnId,
  clientRequestId,
  ordinal: 1,
  prompt: 'Compare this',
  status: 'completed',
  responses: [response('openai'), response('google'), response('minimax'), response('qwen')],
  createdAt: '2026-07-26T20:00:00.000Z',
  updatedAt,
};

describe('frontend conversation contracts', () => {
  it('parses a valid REST turn snapshot and rejects a response without all four slots', () => {
    const snapshot = {
      conversation: { id: conversationId, hasWorkInProgress: false },
      turn,
    };

    expect(turnSnapshotResponseSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      turnSnapshotResponseSchema.safeParse({
        ...snapshot,
        turn: { ...turn, responses: turn.responses.slice(0, 3) },
      }).success
    ).toBe(false);
  });

  it('parses contracted SSE events and rejects non-integer or negative event sequences', () => {
    const events = [
      {
        event: 'slot_update',
        data: {
          conversationId,
          turnId,
          eventSequence: 4,
          response: response('openai'),
          runtimeStage: 'thinking',
        },
      },
      {
        event: 'turn_update',
        data: {
          conversationId,
          turnId,
          eventSequence: 5,
          turn: { id: turnId, status: 'completed', updatedAt },
        },
      },
      {
        event: 'busy_update',
        data: {
          conversationId,
          turnId,
          eventSequence: 6,
          hasWorkInProgress: false,
          updatedAt,
        },
      },
    ];

    for (const event of events) {
      expect(turnEventSchema.parse(event)).toEqual(event);

      for (const eventSequence of [-1, 1.5]) {
        expect(
          turnEventSchema.safeParse({
            ...event,
            data: { ...event.data, eventSequence },
          }).success
        ).toBe(false);
      }
    }
  });

  it('requires the snapshot to expose its last represented non-negative integer sequence', () => {
    const snapshot = {
      conversationId,
      turnId,
      turn,
      hasWorkInProgress: false,
      updatedAt,
      lastEventSequence: 4,
    };

    expect(turnEventSnapshotSchema.parse(snapshot)).toEqual(snapshot);

    for (const lastEventSequence of [-1, 1.5, undefined]) {
      expect(turnEventSnapshotSchema.safeParse({ ...snapshot, lastEventSequence }).success).toBe(
        false
      );
    }
  });

  it('rejects ModelResponse states that violate the persisted runtime invariants', () => {
    const snapshot = {
      conversation: { id: conversationId, hasWorkInProgress: false },
      turn,
    };
    const invalidResponses = [
      ['completed without content', { ...response('openai'), content: '   ' }],
      ['completed with an error', {
        ...response('openai'),
        error: { code: 'provider_error', message: 'Safe failure' },
      }],
      ['failed without an error', {
        ...response('openai'),
        status: 'failed',
        content: null,
        error: null,
      }],
      ['running with an error', {
        ...response('openai'),
        status: 'running',
        content: null,
        error: { code: 'provider_error', message: 'Safe failure' },
      }],
      ['continued completed base', { ...response('openai'), continuedWithout: true }],
      ['continued failed Qwen', {
        ...response('qwen'),
        status: 'failed',
        content: null,
        error: { code: 'provider_error', message: 'Safe failure' },
        continuedWithout: true,
      }],
      ['stale base', { ...response('openai'), isStale: true }],
    ] as const;

    const acceptedInvalidStates = invalidResponses.flatMap(([label, candidate]) => {
      const responses: unknown[] = [...turn.responses];
      responses[candidate.slot === 'qwen' ? 3 : 0] = candidate;
      return turnSnapshotResponseSchema.safeParse({
        ...snapshot,
        turn: { ...turn, responses },
      }).success
        ? [label]
        : [];
    });
    expect(acceptedInvalidStates).toEqual([]);

    expect(
      turnSnapshotResponseSchema.safeParse({
        ...snapshot,
        turn: {
          ...turn,
          responses: [
            ...turn.responses.slice(0, 3),
            { ...response('qwen'), isStale: true },
          ],
        },
      }).success,
    ).toBe(true);
  });
});
