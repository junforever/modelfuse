import type {
  ResponseSlot,
  ResponseStatus,
  TurnStatus,
} from '../../../../types/conversations.js';

export interface RecoveryResponseCase {
  id: string;
  slot: ResponseSlot;
  status: ResponseStatus;
  content: string | null;
  errorCode?: string;
  recoverable?: boolean;
}

export interface RecoveryTurnCase {
  id: string;
  clientRequestId: string;
  ordinal: number;
  prompt: string;
  status: TurnStatus;
  expectedStatus: TurnStatus;
  responses: readonly RecoveryResponseCase[];
}

export interface RecoveryCase {
  id: string;
  clientRequestId: string;
  title: string;
  turns: readonly RecoveryTurnCase[];
}

export const RECOVERY_FIXTURE_VERSION = 1;

export const recoveryCases = [
  {
    id: '92000000-0000-4000-8000-000000000001',
    clientRequestId: '92400000-0000-4000-8000-000000000001',
    title: 'Recovery partial',
    turns: [
      {
        id: '92100000-0000-4000-8000-000000000001',
        clientRequestId: '92200000-0000-4000-8000-000000000001',
        ordinal: 1,
        prompt: 'Completed prompt in partial case',
        status: 'completed',
        expectedStatus: 'completed',
        responses: completedResponses('92300000-0000-4000-8000-00000000000', 'partial-1'),
      },
      {
        id: '92100000-0000-4000-8000-000000000002',
        clientRequestId: '92200000-0000-4000-8000-000000000002',
        ordinal: 2,
        prompt: 'Interrupted prompt with one durable answer',
        status: 'running',
        expectedStatus: 'partial',
        responses: [
          response(
            '92300000-0000-4000-8000-000000000005',
            'openai',
            'completed',
            'partial-2-openai',
          ),
          response('92300000-0000-4000-8000-000000000006', 'google', 'running'),
          response('92300000-0000-4000-8000-000000000007', 'minimax', 'pending'),
          response('92300000-0000-4000-8000-000000000008', 'qwen', 'pending'),
        ],
      },
    ],
  },
  {
    id: '92000000-0000-4000-8000-000000000002',
    clientRequestId: '92400000-0000-4000-8000-000000000002',
    title: 'Recovery failed',
    turns: [
      {
        id: '92100000-0000-4000-8000-000000000003',
        clientRequestId: '92200000-0000-4000-8000-000000000003',
        ordinal: 1,
        prompt: 'Existing partial prompt',
        status: 'partial',
        expectedStatus: 'partial',
        responses: [
          response(
            '92300000-0000-4000-8000-000000000009',
            'openai',
            'completed',
            'failed-1-openai',
          ),
          response(
            '92300000-0000-4000-8000-000000000010',
            'google',
            'failed',
            null,
            'provider_error',
            false,
          ),
          response(
            '92300000-0000-4000-8000-000000000011',
            'minimax',
            'completed',
            'failed-1-minimax',
          ),
          response(
            '92300000-0000-4000-8000-000000000012',
            'qwen',
            'completed',
            'failed-1-qwen',
          ),
        ],
      },
      {
        id: '92100000-0000-4000-8000-000000000004',
        clientRequestId: '92200000-0000-4000-8000-000000000004',
        ordinal: 2,
        prompt: 'Interrupted prompt without durable answers',
        status: 'running',
        expectedStatus: 'failed',
        responses: [
          response('92300000-0000-4000-8000-000000000013', 'openai', 'running'),
          response('92300000-0000-4000-8000-000000000014', 'google', 'pending'),
          response('92300000-0000-4000-8000-000000000015', 'minimax', 'running'),
          response('92300000-0000-4000-8000-000000000016', 'qwen', 'pending'),
        ],
      },
    ],
  },
] as const satisfies readonly RecoveryCase[];

function completedResponses(
  idPrefix: string,
  contentPrefix: string,
): readonly RecoveryResponseCase[] {
  return (['openai', 'google', 'minimax', 'qwen'] as const).map((slot, index) =>
    response(`${idPrefix}${index + 1}`, slot, 'completed', `${contentPrefix}-${slot}`),
  );
}

function response(
  id: string,
  slot: ResponseSlot,
  status: ResponseStatus,
  content: string | null = null,
  errorCode?: string,
  recoverable?: boolean,
): RecoveryResponseCase {
  return { id, slot, status, content, errorCode, recoverable };
}
