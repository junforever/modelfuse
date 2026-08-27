import { z } from 'zod';

import {
  MODALITIES,
  PROVIDER_IDS,
  RESPONSE_SLOTS,
  type ApiError,
  type BaseResponseSlot,
  type ConversationDetail,
  type ConversationPage,
  type ConversationSummary,
  type ConversationTurnResponse,
  type DeploymentCatalogItem,
  type DeploymentIds,
  type DeploymentSummaryTuple,
  type DefaultProfileUnavailableError,
  type Modality,
  type ModelCatalogResponse,
  type ResponseSlot,
  type TurnPage,
  type TurnSnapshotResponse,
} from '../types/conversation';
import type { TurnEvent, TurnEventSnapshot } from '../types/sse';

const uuidSchema = z.uuid();
const dateTimeSchema = z.iso.datetime({ offset: true });
const eventSequenceSchema = z.number().int().nonnegative();
const nonBlankStringSchema = z.string().refine(value => value.trim().length > 0);
const turnStatusSchema = z.enum(['pending', 'running', 'partial', 'completed', 'failed']);

export const responseSlotSchema = z.enum(RESPONSE_SLOTS);
export const providerIdSchema = z.enum(PROVIDER_IDS);
export const modalitySchema = z.enum(MODALITIES);

const modalityListSchema: z.ZodType<readonly [Modality, ...Modality[]]> = z
  .array(modalitySchema)
  .nonempty()
  .refine(modalities => new Set(modalities).size === modalities.length) as unknown as z.ZodType<
  readonly [Modality, ...Modality[]]
>;

export const deploymentCatalogItemSchema: z.ZodType<DeploymentCatalogItem> = z.strictObject({
  deploymentId: nonBlankStringSchema,
  providerId: providerIdSchema,
  modelId: nonBlankStringSchema,
  displayName: nonBlankStringSchema,
  contextLimitTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  inputModalities: modalityListSchema,
  outputModalities: modalityListSchema,
});

export const modelCatalogResponseSchema: z.ZodType<ModelCatalogResponse> = z.strictObject({
  items: z.array(deploymentCatalogItemSchema),
});

export const deploymentIdsSchema: z.ZodType<DeploymentIds> = z.strictObject({
  'base-1': nonBlankStringSchema,
  'base-2': nonBlankStringSchema,
  'base-3': nonBlankStringSchema,
  consolidator: nonBlankStringSchema,
});

function deploymentSummarySchema<Slot extends ResponseSlot>(slot: Slot) {
  return z.strictObject({
    slot: z.literal(slot),
    deploymentId: nonBlankStringSchema,
    providerId: providerIdSchema,
    modelId: nonBlankStringSchema,
    displayName: nonBlankStringSchema,
  });
}

const base1DeploymentSummarySchema = deploymentSummarySchema('base-1');
const base2DeploymentSummarySchema = deploymentSummarySchema('base-2');
const base3DeploymentSummarySchema = deploymentSummarySchema('base-3');
const consolidatorDeploymentSummarySchema = deploymentSummarySchema('consolidator');

const conversationDeploymentSummaryOptions = [
  base1DeploymentSummarySchema,
  base2DeploymentSummarySchema,
  base3DeploymentSummarySchema,
  consolidatorDeploymentSummarySchema,
] as const;

export const conversationDeploymentSummarySchema = z.discriminatedUnion(
  'slot',
  conversationDeploymentSummaryOptions
);

export const deploymentSummaryTupleSchema: z.ZodType<DeploymentSummaryTuple> = z.tuple([
  base1DeploymentSummarySchema,
  base2DeploymentSummarySchema,
  base3DeploymentSummarySchema,
  consolidatorDeploymentSummarySchema,
]);

const contextWindowMetadataSchema = z.strictObject({
  truncated: z.boolean(),
  firstIncludedOrdinal: z.number().int().positive(),
  lastIncludedOrdinal: z.number().int().positive(),
  protectionApplied: z.string(),
});

const responseMetadataSchema = z
  .strictObject({
    durationMs: z.number().nonnegative().optional(),
    contextWindow: contextWindowMetadataSchema.optional(),
  })
  .nullable();

const responseErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

const responseCommonShape = {
  provider: z.string(),
  model: z.string(),
  recoverable: z.boolean(),
  attemptNo: z.number().int().min(1),
  metadata: responseMetadataSchema,
  startedAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
};

function baseResponseSchema<Slot extends BaseResponseSlot>(slot: Slot) {
  const identityShape = {
    slot: z.literal(slot),
    role: z.literal('base'),
    isStale: z.literal(false),
  };

  return z.discriminatedUnion('status', [
    z.strictObject({
      ...responseCommonShape,
      ...identityShape,
      status: z.literal('pending'),
      content: z.string().nullable(),
      error: z.null(),
      continuedWithout: z.literal(false),
    }),
    z.strictObject({
      ...responseCommonShape,
      ...identityShape,
      status: z.literal('running'),
      content: z.string().nullable(),
      error: z.null(),
      continuedWithout: z.literal(false),
    }),
    z.strictObject({
      ...responseCommonShape,
      ...identityShape,
      status: z.literal('completed'),
      content: nonBlankStringSchema,
      error: z.null(),
      continuedWithout: z.literal(false),
    }),
    z.strictObject({
      ...responseCommonShape,
      ...identityShape,
      status: z.literal('failed'),
      content: z.string().nullable(),
      error: responseErrorSchema,
      continuedWithout: z.boolean(),
    }),
  ]);
}

const base1ResponseSchema = baseResponseSchema('base-1');
const base2ResponseSchema = baseResponseSchema('base-2');
const base3ResponseSchema = baseResponseSchema('base-3');
const consolidatorIdentityShape = {
  slot: z.literal('consolidator'),
  role: z.literal('consolidator'),
  continuedWithout: z.literal(false),
  isStale: z.boolean(),
};
const consolidatorResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...responseCommonShape,
    ...consolidatorIdentityShape,
    status: z.literal('pending'),
    content: z.string().nullable(),
    error: z.null(),
  }),
  z.strictObject({
    ...responseCommonShape,
    ...consolidatorIdentityShape,
    status: z.literal('running'),
    content: z.string().nullable(),
    error: z.null(),
  }),
  z.strictObject({
    ...responseCommonShape,
    ...consolidatorIdentityShape,
    status: z.literal('completed'),
    content: nonBlankStringSchema,
    error: z.null(),
  }),
  z.strictObject({
    ...responseCommonShape,
    ...consolidatorIdentityShape,
    status: z.literal('failed'),
    content: z.string().nullable(),
    error: responseErrorSchema,
  }),
]);

const modelResponseSchema = z.union([
  base1ResponseSchema,
  base2ResponseSchema,
  base3ResponseSchema,
  consolidatorResponseSchema,
]);

const turnSchema = z.strictObject({
  id: uuidSchema,
  clientRequestId: uuidSchema,
  ordinal: z.number().int().positive(),
  prompt: z.string(),
  status: turnStatusSchema,
  responses: z.tuple([
    base1ResponseSchema,
    base2ResponseSchema,
    base3ResponseSchema,
    consolidatorResponseSchema,
  ]),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

const conversationSummaryShape = {
  id: uuidSchema,
  title: z.string(),
  hasWorkInProgress: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
};

export const conversationSummarySchema: z.ZodType<ConversationSummary> =
  z.strictObject(conversationSummaryShape);

export const conversationDetailSchema: z.ZodType<ConversationDetail> = z.strictObject({
  ...conversationSummaryShape,
  deployments: deploymentSummaryTupleSchema,
});

export const conversationPageSchema: z.ZodType<ConversationPage> = z.strictObject({
  items: z.array(conversationSummarySchema),
  nextCursor: z.string().nullable(),
});

export const turnPageSchema: z.ZodType<TurnPage> = z.strictObject({
  items: z.array(turnSchema),
  olderCursor: z.string().nullable(),
  hasOlder: z.boolean(),
});

const genericApiErrorSchema = z.strictObject({
  code: z.string().refine(code => code !== 'DEFAULT_PROFILE_UNAVAILABLE'),
  message: z.string(),
  requestId: z.string(),
});

const defaultProfileUnavailableErrorSchema: z.ZodType<DefaultProfileUnavailableError> =
  z.strictObject({
    code: z.literal('DEFAULT_PROFILE_UNAVAILABLE'),
    message: z.string(),
    requestId: z.string(),
    missingDeploymentIds: z
      .tuple([nonBlankStringSchema])
      .rest(nonBlankStringSchema)
      .refine(ids => new Set(ids).size === ids.length),
  });

export const apiErrorSchema: z.ZodType<ApiError | DefaultProfileUnavailableError> = z.union([
  genericApiErrorSchema,
  defaultProfileUnavailableErrorSchema,
]);

export const conversationTurnResponseSchema: z.ZodType<ConversationTurnResponse> = z.strictObject({
  conversation: conversationDetailSchema,
  turn: turnSchema,
});

export const turnSnapshotResponseSchema: z.ZodType<TurnSnapshotResponse> = z.strictObject({
  conversation: z.strictObject({
    id: uuidSchema,
    hasWorkInProgress: z.boolean(),
  }),
  turn: turnSchema,
});

export const turnEventSchema: z.ZodType<TurnEvent> = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('slot_update'),
    data: z.strictObject({
      conversationId: uuidSchema,
      turnId: uuidSchema,
      eventSequence: eventSequenceSchema,
      response: modelResponseSchema,
      runtimeStage: z.string().optional(),
    }),
  }),
  z.strictObject({
    event: z.literal('turn_update'),
    data: z.strictObject({
      conversationId: uuidSchema,
      turnId: uuidSchema,
      eventSequence: eventSequenceSchema,
      turn: z.strictObject({
        id: uuidSchema,
        status: turnStatusSchema,
        updatedAt: dateTimeSchema,
      }),
    }),
  }),
  z.strictObject({
    event: z.literal('busy_update'),
    data: z.strictObject({
      conversationId: uuidSchema,
      turnId: uuidSchema,
      eventSequence: eventSequenceSchema,
      hasWorkInProgress: z.boolean(),
      updatedAt: dateTimeSchema,
    }),
  }),
]);

export const turnEventSnapshotSchema: z.ZodType<TurnEventSnapshot> = z.strictObject({
  conversationId: uuidSchema,
  turnId: uuidSchema,
  deployments: deploymentSummaryTupleSchema,
  turn: turnSchema,
  hasWorkInProgress: z.boolean(),
  updatedAt: dateTimeSchema,
  lastEventSequence: eventSequenceSchema,
});
