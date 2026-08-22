import type { ResponseSlot, ResponseStatus, TurnStatus } from '../../../../types/conversations.js';

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

export const RECOVERY_FIXTURE_VERSION = 2;

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
            'base-1',
            'completed',
            'partial-2-base-1'
          ),
          response('92300000-0000-4000-8000-000000000006', 'base-2', 'running'),
          response('92300000-0000-4000-8000-000000000007', 'base-3', 'pending'),
          response('92300000-0000-4000-8000-000000000008', 'consolidator', 'pending'),
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
            'base-1',
            'completed',
            'failed-1-base-1'
          ),
          response(
            '92300000-0000-4000-8000-000000000010',
            'base-2',
            'failed',
            null,
            'provider_error',
            false
          ),
          response(
            '92300000-0000-4000-8000-000000000011',
            'base-3',
            'completed',
            'failed-1-base-3'
          ),
          response(
            '92300000-0000-4000-8000-000000000012',
            'consolidator',
            'completed',
            'failed-1-consolidator'
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
          response('92300000-0000-4000-8000-000000000013', 'base-1', 'running'),
          response('92300000-0000-4000-8000-000000000014', 'base-2', 'pending'),
          response('92300000-0000-4000-8000-000000000015', 'base-3', 'running'),
          response('92300000-0000-4000-8000-000000000016', 'consolidator', 'pending'),
        ],
      },
    ],
  },
] as const satisfies readonly RecoveryCase[];

function completedResponses(
  idPrefix: string,
  contentPrefix: string
): readonly RecoveryResponseCase[] {
  return (['base-1', 'base-2', 'base-3', 'consolidator'] as const).map((slot, index) =>
    response(`${idPrefix}${index + 1}`, slot, 'completed', `${contentPrefix}-${slot}`)
  );
}

function response(
  id: string,
  slot: ResponseSlot,
  status: ResponseStatus,
  content: string | null = null,
  errorCode?: string,
  recoverable?: boolean
): RecoveryResponseCase {
  return { id, slot, status, content, errorCode, recoverable };
}
