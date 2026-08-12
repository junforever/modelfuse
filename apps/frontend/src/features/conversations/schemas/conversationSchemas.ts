import { z } from 'zod';

import type {
  ApiError,
  ConversationPage,
  ConversationSummary,
  ConversationTurnResponse,
  TurnPage,
  TurnSnapshotResponse,
} from '../types/conversation';
import type { TurnEvent, TurnEventSnapshot } from '../types/sse';

const uuidSchema = z.uuid();
const dateTimeSchema = z.iso.datetime({ offset: true });
const eventSequenceSchema = z.number().int().nonnegative();
const turnStatusSchema = z.enum(['pending', 'running', 'partial', 'completed', 'failed']);
const responseShape = {
  provider: z.string(),
  model: z.string(),
  recoverable: z.boolean(),
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

const responseErrorSchema = z.object({ code: z.string(), message: z.string() });
const responseLifecycleSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    content: z.string().nullable(),
    error: z.null(),
    continuedWithout: z.literal(false),
  }),
  z.object({
    status: z.literal('running'),
    content: z.string().nullable(),
    error: z.null(),
    continuedWithout: z.literal(false),
  }),
  z.object({
    status: z.literal('completed'),
    content: z.string().refine(content => content.trim().length > 0),
    error: z.null(),
    continuedWithout: z.literal(false),
  }),
  z.object({
    status: z.literal('failed'),
    content: z.string().nullable(),
    error: responseErrorSchema,
    continuedWithout: z.boolean(),
  }),
]);

function responseSchema<Slot extends 'openai' | 'google' | 'minimax'>(slot: Slot) {
  return z.intersection(
    z.object(responseShape),
    z.intersection(
      responseLifecycleSchema,
      z.object({
        slot: z.literal(slot),
        role: z.literal('base'),
        isStale: z.literal(false),
      })
    )
  );
}

const openaiResponseSchema = responseSchema('openai');
const googleResponseSchema = responseSchema('google');
const minimaxResponseSchema = responseSchema('minimax');
const qwenResponseSchema = z.intersection(
  z.object(responseShape),
  z.intersection(
    responseLifecycleSchema,
    z.object({
      slot: z.literal('qwen'),
      role: z.literal('consolidator'),
      continuedWithout: z.literal(false),
      isStale: z.boolean(),
    })
  )
);
const modelResponseSchema = z.union([
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
export const conversationSummarySchema: z.ZodType<ConversationSummary> = z.object({
  id: uuidSchema,
  title: z.string(),
  hasWorkInProgress: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const conversationPageSchema: z.ZodType<ConversationPage> = z.object({
  items: z.array(conversationSummarySchema),
  nextCursor: z.string().nullable(),
});

export const turnPageSchema: z.ZodType<TurnPage> = z.object({
  items: z.array(turnSchema),
  olderCursor: z.string().nullable(),
  hasOlder: z.boolean(),
});

export const apiErrorSchema: z.ZodType<ApiError> = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

export const conversationTurnResponseSchema: z.ZodType<ConversationTurnResponse> = z.object({
  conversation: conversationSummarySchema,
  turn: turnSchema,
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
