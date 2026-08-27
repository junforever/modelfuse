import { describe, expect, it } from 'vitest';

import {
  conversationDetailSchema,
  conversationTurnResponseSchema,
  deploymentIdsSchema,
  modelCatalogResponseSchema,
  turnEventSchema,
  turnEventSnapshotSchema,
  turnSnapshotResponseSchema,
} from '../schemas/conversationSchemas';
import type {
  DeploymentSummaryTuple,
  ModelResponse,
  ResponseSlot,
  Turn,
} from '../types/conversation';

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const turnId = '223e4567-e89b-42d3-a456-426614174000';
const clientRequestId = '323e4567-e89b-42d3-a456-426614174000';
const updatedAt = '2026-07-26T20:00:01.000Z';

const providers: Record<ResponseSlot, string> = {
  'base-1': 'openai',
  'base-2': 'google',
  'base-3': 'minimax',
  consolidator: 'qwen',
};

function response<Slot extends ResponseSlot>(slot: Slot): ModelResponse<Slot> {
  const provider = providers[slot];

  return {
    slot,
    role: slot === 'consolidator' ? 'consolidator' : 'base',
    provider,
    model: `${provider}-model`,
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
  } as ModelResponse<Slot>;
}

const turn: Turn = {
  id: turnId,
  clientRequestId,
  ordinal: 1,
  prompt: 'Compare this',
  status: 'completed',
  responses: [response('base-1'), response('base-2'), response('base-3'), response('consolidator')],
  createdAt: '2026-07-26T20:00:00.000Z',
  updatedAt,
};

const deployments: DeploymentSummaryTuple = [
  {
    slot: 'base-1',
    deploymentId: 'base-1-deployment',
    providerId: 'openai',
    modelId: 'base-1-model',
    displayName: 'GPT',
  },
  {
    slot: 'base-2',
    deploymentId: 'base-2-deployment',
    providerId: 'google',
    modelId: 'base-2-model',
    displayName: 'Gemini',
  },
  {
    slot: 'base-3',
    deploymentId: 'base-3-deployment',
    providerId: 'openrouter',
    modelId: 'base-3-model',
    displayName: 'MiniMax',
  },
  {
    slot: 'consolidator',
    deploymentId: 'consolidator-deployment',
    providerId: 'openrouter',
    modelId: 'consolidator-model',
    displayName: 'Qwen',
  },
];

describe('frontend conversation contracts', () => {
  it('strictly validates catalog, detail, and creation response contracts', () => {
    const catalogItem = {
      deploymentId: 'openrouter-model',
      providerId: 'openrouter',
      modelId: 'vendor/model',
      displayName: 'Vendor Model',
      contextLimitTokens: 100_000,
      maxOutputTokens: 8_000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    };
    const catalog = { items: [catalogItem] };
    const detail = {
      id: conversationId,
      title: 'Conversation',
      hasWorkInProgress: true,
      deployments,
      createdAt: updatedAt,
      updatedAt,
    };
    const creation = { conversation: detail, turn };

    expect(modelCatalogResponseSchema.parse(catalog)).toEqual(catalog);
    expect(conversationDetailSchema.parse(detail)).toEqual(detail);
    expect(conversationTurnResponseSchema.parse(creation)).toEqual(creation);
    expect(
      modelCatalogResponseSchema.safeParse({
        items: [{ ...catalogItem, credentialEnv: 'SECRET_MUST_NOT_BE_PUBLIC' }],
      }).success
    ).toBe(false);
    expect(
      conversationTurnResponseSchema.safeParse({
        ...creation,
        conversation: { ...detail, deployments: [...deployments].reverse() },
      }).success
    ).toBe(false);
  });

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
    expect(
      turnSnapshotResponseSchema.safeParse({
        ...snapshot,
        turn: {
          ...turn,
          responses: [{ ...response('base-1'), attemptNo: 0 }, ...turn.responses.slice(1)],
        },
      }).success
    ).toBe(false);
  });

  it('accepts only the strict canonical slot shape across UI, REST and SSE contracts', () => {
    const deploymentIds = {
      'base-1': 'deployment-1',
      'base-2': 'deployment-2',
      'base-3': 'deployment-3',
      consolidator: 'deployment-4',
    };

    expect(deploymentIdsSchema.parse(deploymentIds)).toEqual(deploymentIds);

    for (const legacySlot of ['openai', 'google', 'minimax', 'qwen'] as const) {
      expect(
        deploymentIdsSchema.safeParse({ ...deploymentIds, [legacySlot]: 'legacy-deployment' })
          .success
      ).toBe(false);

      const legacyResponse = { ...response('base-1'), slot: legacySlot };
      expect(
        turnSnapshotResponseSchema.safeParse({
          conversation: { id: conversationId, hasWorkInProgress: false },
          turn: { ...turn, responses: [legacyResponse, ...turn.responses.slice(1)] },
        }).success
      ).toBe(false);
      expect(
        turnEventSchema.safeParse({
          event: 'slot_update',
          data: { conversationId, turnId, eventSequence: 1, response: legacyResponse },
        }).success
      ).toBe(false);
    }
  });

  it('parses contracted SSE events and rejects non-integer or negative event sequences', () => {
    const events = [
      {
        event: 'slot_update',
        data: {
          conversationId,
          turnId,
          eventSequence: 4,
          response: response('base-1'),
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
      deployments,
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
      ['completed without content', { ...response('base-1'), content: '   ' }],
      [
        'completed with an error',
        {
          ...response('base-1'),
          error: { code: 'provider_error', message: 'Safe failure' },
        },
      ],
      [
        'failed without an error',
        {
          ...response('base-1'),
          status: 'failed',
          content: null,
          error: null,
        },
      ],
      [
        'running with an error',
        {
          ...response('base-1'),
          status: 'running',
          content: null,
          error: { code: 'provider_error', message: 'Safe failure' },
        },
      ],
      ['continued completed base', { ...response('base-1'), continuedWithout: true }],
      [
        'continued failed consolidator',
        {
          ...response('consolidator'),
          status: 'failed',
          content: null,
          error: { code: 'provider_error', message: 'Safe failure' },
          continuedWithout: true,
        },
      ],
      ['stale base', { ...response('base-1'), isStale: true }],
    ] as const;

    const acceptedInvalidStates = invalidResponses.flatMap(([label, candidate]) => {
      const responses: unknown[] = [...turn.responses];
      responses[candidate.slot === 'consolidator' ? 3 : 0] = candidate;
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
            { ...response('consolidator'), isStale: true },
          ],
        },
      }).success
    ).toBe(true);
  });
});
