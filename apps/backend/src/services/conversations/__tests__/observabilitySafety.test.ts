import type { NextFunction, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationRepository } from '../../../infrastructure/postgres/repositories/conversationRepository.js';
import type {
  StoredTurnSnapshot,
  TurnRepository,
} from '../../../infrastructure/postgres/repositories/turnRepository.js';
import { createTurnEventsController } from '../../../controllers/conversations/turnEventsController.js';
import { requestContextMiddleware } from '../../../middleware/logger/requestContext.js';
import { createConversationFixture } from '../../../test/fixtures/conversationFixtures.js';
import type { LlmProvider } from '../../../types/llm.js';
import { ConversationService } from '../ConversationService.js';
import { recoverInterruptedTurns } from '../recoverInterruptedTurns.js';
import { TurnOrchestrator } from '../TurnOrchestrator.js';
import type { TurnEventPublisher } from '../turnEventPublisher.js';
import { recoveryCases } from './fixtures/recoveryCases.js';

const logSink = vi.hoisted(() => {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();

  const bind = (bindings: Record<string, unknown> = {}) => {
    const emit = (sink: typeof info, args: unknown[]): void => {
      const [first, ...rest] = args;
      sink(
        typeof first === 'object' && first !== null
          ? { ...bindings, ...first }
          : first,
        ...rest,
      );
    };

    return {
      info: (...args: unknown[]) => emit(info, args),
      warn: (...args: unknown[]) => emit(warn, args),
      error: (...args: unknown[]) => emit(error, args),
      child: (childBindings: Record<string, unknown>) =>
        bind({ ...bindings, ...childBindings }),
    };
  };

  return { bind, error, info, warn };
});

vi.mock('../../../utils/logger.js', () => ({
  logger: logSink.bind(),
  createRequestLogger: (requestId: string) => logSink.bind({ requestId }),
}));

const PROMPT = 'prompt-canary-do-not-log';
const RESPONSE_CONTENT = 'response-canary-do-not-log';
const SSE_PAYLOAD = 'sse-payload-canary-do-not-log';
const AUTHORIZATION = 'Bearer credential-canary-do-not-log';
const USER_AGENT = 'user-agent-header-canary-do-not-log';
const MEASUREMENT = 314_159;
const LIMIT = 87_654_321;

function logEntries(): Record<string, unknown>[] {
  return [logSink.info, logSink.warn, logSink.error].flatMap(sink =>
    sink.mock.calls.flatMap(([entry]) =>
      typeof entry === 'object' && entry !== null
        ? [entry as Record<string, unknown>]
        : [],
    ),
  );
}

function expectLogsToExclude(...values: readonly (string | number)[]): void {
  const output = JSON.stringify([
    ...logSink.info.mock.calls,
    ...logSink.warn.mock.calls,
    ...logSink.error.mock.calls,
  ]);

  for (const value of values) expect(output).not.toContain(String(value));
}

describe('conversation observability safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs request IDs and duration without request content, headers, or secrets', () => {
    let finish: (() => void) | undefined;
    const request = {
      body: { prompt: PROMPT },
      headers: {
        authorization: AUTHORIZATION,
        'user-agent': USER_AGENT,
        'x-request-id': 'request-1',
      },
      ip: '127.0.0.1',
      method: 'POST',
      path: '/api/v1/conversations',
    } as unknown as Request;
    const response = {
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'finish') finish = listener;
      }),
      statusCode: 202,
    } as unknown as Response;

    requestContextMiddleware(request, response, vi.fn() as NextFunction);
    finish?.();

    expect(logEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'request_started',
        requestId: 'request-1',
        method: 'POST',
        route: '/api/v1/conversations',
      }),
      expect.objectContaining({
        operation: 'request_completed',
        requestId: 'request-1',
        statusCode: 202,
        durationMs: expect.any(Number),
      }),
    ]));
    expectLogsToExclude(PROMPT, AUTHORIZATION, USER_AGENT, 'authorization');
  });

  it('logs replay and busy decisions using only their technical identifiers', async () => {
    const snapshot = createConversationFixture() as StoredTurnSnapshot;
    snapshot.turn.prompt = PROMPT;
    snapshot.turn.responses[0].content = RESPONSE_CONTENT;
    const createTurn = vi.fn()
      .mockResolvedValueOnce({
        kind: 'replay',
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
      })
      .mockResolvedValueOnce({ kind: 'busy' });
    const conversationRepository = { createTurn } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(async () => snapshot),
    } as unknown as TurnRepository;
    const orchestrator = {
      responseDefinitions: [],
    } as unknown as TurnOrchestrator;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
    });

    await service.createTurn(snapshot.conversation.id, {
      clientRequestId: snapshot.turn.clientRequestId,
      prompt: PROMPT,
    });
    await expect(service.createTurn(snapshot.conversation.id, {
      clientRequestId: '00000000-0000-4000-8000-000000000004',
      prompt: PROMPT,
    })).rejects.toMatchObject({ code: 'CONVERSATION_BUSY' });

    expect(logEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'turn_replayed',
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
        replay: true,
        hasWorkInProgress: false,
      }),
      expect.objectContaining({
        operation: 'conversation_busy',
        conversationId: snapshot.conversation.id,
        hasWorkInProgress: true,
      }),
    ]));
    expectLogsToExclude(PROMPT, RESPONSE_CONTENT);
  });

  it('logs slot completion and duration without prompts, responses, measurements, or limits', async () => {
    const generate = vi.fn<LlmProvider['generate']>(async () => ({
      content: RESPONSE_CONTENT,
      provider: 'qwen-provider',
      model: 'qwen-model',
      startedAt: '2026-08-11T10:00:00.000Z',
      completedAt: '2026-08-11T10:00:01.250Z',
      metrics: { inputTokens: 271_828 },
      metadata: { authorization: AUTHORIZATION },
    }));
    const provider = (slot: LlmProvider['slot']): LlmProvider => ({
      slot,
      provider: `${slot}-provider`,
      model: `${slot}-model`,
      context: {
        limitTokens: LIMIT,
        measureInputTokens: () => ({ kind: 'exact', tokens: MEASUREMENT }),
      },
      generate: slot === 'qwen' ? generate : vi.fn(),
    });
    const orchestrator = new TurnOrchestrator({
      providerRegistry: {
        openai: provider('openai'),
        google: provider('google'),
        minimax: provider('minimax'),
        qwen: provider('qwen'),
      },
      turnRepository: {
        getAvailableBaseResponses: vi.fn(async () => []),
        persistResponseAttempt: vi.fn(async () => undefined),
      },
      publisher: { publish: vi.fn() },
    });

    await orchestrator.executeRetry({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: PROMPT,
      signal: new AbortController().signal,
      slot: 'qwen',
    });

    expect(logEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'llm_attempt_completed',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        slot: 'qwen',
        provider: 'qwen-provider',
        model: 'qwen-model',
        durationMs: 1_250,
      }),
    ]));
    expectLogsToExclude(
      PROMPT,
      RESPONSE_CONTENT,
      AUTHORIZATION,
      MEASUREMENT,
      LIMIT,
      271_828,
    );
  });

  it('logs SSE connection and closure without logging normalized event payloads', async () => {
    const snapshot = createConversationFixture();
    snapshot.turn.prompt = PROMPT;
    snapshot.turn.responses[0].content = SSE_PAYLOAD;
    const conversationService = {
      getTurn: vi.fn(async () => snapshot),
      getTurnSnapshot: vi.fn(async () => ({
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
        turn: snapshot.turn,
        hasWorkInProgress: false,
        updatedAt: snapshot.conversation.updatedAt,
        lastEventSequence: 7,
      })),
    } as unknown as ConversationService;
    const unsubscribe = vi.fn();
    const publisher = {
      subscribe: vi.fn(() => unsubscribe),
    } as unknown as TurnEventPublisher;
    const request = {
      log: logSink.bind({ requestId: 'request-sse' }),
      validatedParams: {
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
      },
    } as unknown as Request;
    const status = vi.fn();
    const set = vi.fn();
    const flushHeaders = vi.fn();
    const write = vi.fn(() => true);
    const once = vi.fn();
    const end = vi.fn();
    const response = {
      status,
      set,
      flushHeaders,
      write,
      once,
      end,
    } as unknown as Response;
    status.mockReturnValue(response);
    set.mockReturnValue(response);
    once.mockReturnValue(response);
    end.mockReturnValue(response);

    await createTurnEventsController(conversationService, publisher)(
      request,
      response,
      vi.fn() as NextFunction,
    );

    expect(write).toHaveBeenCalledWith(expect.stringContaining(SSE_PAYLOAD));
    expect(logEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'sse_connected',
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
      }),
      expect.objectContaining({
        operation: 'sse_closed',
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
      }),
    ]));
    expectLogsToExclude(PROMPT, SSE_PAYLOAD, 'text/event-stream');
  });

  it('logs recovered turn IDs and counts without database content or secrets', async () => {
    const interrupted = recoveryCases[0].turns[1];
    const conversationId = recoveryCases[0].id;
    const query = vi.fn(async (statement: string) => {
      if (statement === 'BEGIN' || statement === 'COMMIT') {
        return { rowCount: null, rows: [] };
      }
      if (statement.includes('UPDATE model_responses')) {
        return {
          rowCount: 3,
          rows: interrupted.responses.slice(1).map(({ slot }) => ({
            turn_id: interrupted.id,
            slot,
            content: RESPONSE_CONTENT,
            authorization: AUTHORIZATION,
          })),
        };
      }
      if (statement.includes('SELECT turn_id, slot, status, is_stale')) {
        return {
          rowCount: 4,
          rows: interrupted.responses.map(({ slot }, index) => ({
            turn_id: interrupted.id,
            slot,
            status: index === 0 ? 'completed' : 'failed',
            is_stale: false,
            prompt: PROMPT,
            content: RESPONSE_CONTENT,
            authorization: AUTHORIZATION,
          })),
        };
      }
      if (statement.includes('UPDATE turns')) {
        return { rowCount: 1, rows: [{ conversation_id: conversationId }] };
      }
      if (statement.includes('UPDATE conversations')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected recovery query: ${statement}`);
    });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    await recoverInterruptedTurns(pool);

    expect(logEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'recovery_completed',
        recoveredResponseCount: 3,
        recoveredTurnCount: 1,
        turnIds: [interrupted.id],
      }),
    ]));
    expectLogsToExclude(PROMPT, RESPONSE_CONTENT, AUTHORIZATION);
    expect(release).toHaveBeenCalledOnce();
  });
});
