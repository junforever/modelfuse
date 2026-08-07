import {
  RESPONSE_SLOTS,
  type ConversationSummary,
  type ContextWindowMetadata,
  type IsoDateTime,
  type ModelResponse,
  type ModelResponseMetadata,
  type ResponseRole,
  type ResponseSlot,
  type ResponseStatus,
  type Turn,
  type TurnResponses,
  type TurnStatus,
} from '../../../types/conversations.js';

type Timestamp = Date | string;

export interface ConversationRow {
  id: string;
  title: string;
  has_work_in_progress: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  [column: string]: unknown;
}

export interface TurnRow {
  id: string;
  client_request_id: string;
  ordinal: number;
  user_content: string;
  status: TurnStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
  [column: string]: unknown;
}

export interface ModelResponseRow {
  slot: ResponseSlot;
  role: ResponseRole;
  provider: string;
  model: string;
  status: ResponseStatus;
  content: string | null;
  error_code: string | null;
  error_message: string | null;
  error_recoverable: boolean | null;
  continued_without_at: Timestamp | null;
  is_stale: boolean;
  attempt_no: number;
  metadata: unknown;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  [column: string]: unknown;
}

function toIsoDateTime(value: Timestamp): IsoDateTime {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIsoDateTime(value: Timestamp | null): IsoDateTime | null {
  return value === null ? null : toIsoDateTime(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapContextWindow(value: unknown): ContextWindowMetadata | undefined {
  if (
    !isRecord(value) ||
    typeof value.truncated !== 'boolean' ||
    typeof value.firstIncludedOrdinal !== 'number' ||
    typeof value.lastIncludedOrdinal !== 'number' ||
    typeof value.protectionApplied !== 'string'
  ) {
    return undefined;
  }

  return {
    truncated: value.truncated,
    firstIncludedOrdinal: value.firstIncludedOrdinal,
    lastIncludedOrdinal: value.lastIncludedOrdinal,
    protectionApplied: value.protectionApplied,
  };
}

function mapMetadata(value: unknown): ModelResponseMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const metadata: ModelResponseMetadata = {};

  if (typeof value.durationMs === 'number' && Number.isFinite(value.durationMs)) {
    metadata.durationMs = value.durationMs;
  }

  const contextWindow = mapContextWindow(value.contextWindow);
  if (contextWindow !== undefined) {
    metadata.contextWindow = contextWindow;
  }

  return Object.keys(metadata).length === 0 ? null : metadata;
}

function requireResponse<Slot extends ResponseSlot>(
  responses: ReadonlyMap<ResponseSlot, ModelResponse>,
  slot: Slot,
): ModelResponse<Slot> {
  const response = responses.get(slot);
  if (response === undefined) {
    throw new Error(`Missing model response slot: ${slot}`);
  }

  return response as ModelResponse<Slot>;
}

function orderResponses(responses: readonly ModelResponse[]): TurnResponses {
  if (responses.length !== RESPONSE_SLOTS.length) {
    throw new Error(`Expected exactly ${RESPONSE_SLOTS.length} model response slots`);
  }

  const bySlot = new Map(responses.map((response) => [response.slot, response]));
  if (bySlot.size !== RESPONSE_SLOTS.length) {
    throw new Error('Model response slots must be unique');
  }

  return [
    requireResponse(bySlot, 'openai'),
    requireResponse(bySlot, 'google'),
    requireResponse(bySlot, 'minimax'),
    requireResponse(bySlot, 'qwen'),
  ];
}

export function mapConversationRow(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    hasWorkInProgress: row.has_work_in_progress,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

export function mapModelResponseRow(row: ModelResponseRow): ModelResponse {
  return {
    slot: row.slot,
    role: row.role,
    provider: row.provider,
    model: row.model,
    status: row.status,
    content: row.content,
    error:
      row.error_code === null
        ? null
        : { code: row.error_code, message: row.error_message ?? row.error_code },
    recoverable: row.error_recoverable === true,
    continuedWithout: row.continued_without_at !== null,
    isStale: row.is_stale,
    attemptNo: row.attempt_no,
    metadata: mapMetadata(row.metadata),
    startedAt: toNullableIsoDateTime(row.started_at),
    completedAt: toNullableIsoDateTime(row.completed_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

export function mapTurnRow(row: TurnRow, responses: readonly ModelResponse[]): Turn {
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    ordinal: row.ordinal,
    prompt: row.user_content,
    status: row.status,
    responses: orderResponses(responses),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}
