import { z } from 'zod';

import type { TurnSnapshotResponse } from '../types/conversation';
import type { TurnEvent, TurnEventSnapshot } from '../types/sse';

const uuidSchema = z.uuid();
const dateTimeSchema = z.iso.datetime({ offset: true });
const eventSequenceSchema = z.number().int().nonnegative();
const responseStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
const turnStatusSchema = z.enum(['pending', 'running', 'partial', 'completed', 'failed']);
const responseShape = {
  provider: z.string(),
  model: z.string(),
  status: responseStatusSchema,
  content: z.string().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  recoverable: z.boolean(),
  continuedWithout: z.boolean(),
  isStale: z.boolean(),
  attemptNo: z.number().int().nonnegative(),
  metadata: z
    .object({
      durationMs: z.number().nonnegative().optional(),
      contextWindow: z
        .object({
          truncated: z.boolean(),
          firstIncludedOrdinal: z.number().int().positive(),
          lastIncludedOrdinal: z.number().int().positive(),
          protectionApplied: z.string(),
        })
        .optional(),
    })
    .nullable(),
  startedAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
};

const openaiResponseSchema = z.object({
  ...responseShape,
  slot: z.literal('openai'),
  role: z.literal('base'),
});
const googleResponseSchema = z.object({
  ...responseShape,
  slot: z.literal('google'),
  role: z.literal('base'),
});
const minimaxResponseSchema = z.object({
  ...responseShape,
  slot: z.literal('minimax'),
  role: z.literal('base'),
});
const qwenResponseSchema = z.object({
  ...responseShape,
  slot: z.literal('qwen'),
  role: z.literal('consolidator'),
});
const modelResponseSchema = z.discriminatedUnion('slot', [
  openaiResponseSchema,
  googleResponseSchema,
  minimaxResponseSchema,
  qwenResponseSchema,
]);
const turnSchema = z.object({
  id: uuidSchema,
  clientRequestId: uuidSchema,
  ordinal: z.number().int().positive(),
  prompt: z.string(),
  status: turnStatusSchema,
  responses: z.tuple([
    openaiResponseSchema,
    googleResponseSchema,
    minimaxResponseSchema,
    qwenResponseSchema,
  ]),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const turnSnapshotResponseSchema: z.ZodType<TurnSnapshotResponse> = z.object({
  conversation: z.object({
    id: uuidSchema,
    hasWorkInProgress: z.boolean(),
  }),
  turn: turnSchema,
});

export const turnEventSchema: z.ZodType<TurnEvent> = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('slot_update'),
    data: z.object({
      conversationId: uuidSchema,
      turnId: uuidSchema,
      eventSequence: eventSequenceSchema,
      response: modelResponseSchema,
      runtimeStage: z.string().optional(),
    }),
  }),
  z.object({
    event: z.literal('turn_update'),
    data: z.object({
      conversationId: uuidSchema,
      turnId: uuidSchema,
      eventSequence: eventSequenceSchema,
      turn: z.object({
        id: uuidSchema,
        status: turnStatusSchema,
        updatedAt: dateTimeSchema,
      }),
    }),
  }),
  z.object({
    event: z.literal('busy_update'),
    data: z.object({
      conversationId: uuidSchema,
      turnId: uuidSchema,
      eventSequence: eventSequenceSchema,
      hasWorkInProgress: z.boolean(),
      updatedAt: dateTimeSchema,
    }),
  }),
]);

export const turnEventSnapshotSchema: z.ZodType<TurnEventSnapshot> = z.object({
  conversationId: uuidSchema,
  turnId: uuidSchema,
  turn: turnSchema,
  hasWorkInProgress: z.boolean(),
  updatedAt: dateTimeSchema,
  lastEventSequence: eventSequenceSchema,
});
