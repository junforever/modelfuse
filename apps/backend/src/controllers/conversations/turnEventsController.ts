import type { NextFunction, Request, Response } from 'express';

import type { ValidatedRequest } from '../../middleware/validation/validateRequest.js';
import type { ConversationService } from '../../services/conversations/ConversationService.js';
import type { TurnEventPublisher } from '../../services/conversations/turnEventPublisher.js';
import type { ModelResponse, TurnStatus } from '../../types/conversations.js';
import type { TurnEvent, TurnEventSnapshot } from '../../types/sse.js';

interface TurnParams {
  conversationId: string;
  turnId: string;
}

export function createTurnEventsController(
  conversationService: ConversationService,
  publisher: TurnEventPublisher,
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const { conversationId, turnId } = (request as ValidatedRequest).validatedParams as TurnParams;

    try {
      await conversationService.getTurn(conversationId, turnId);
    } catch (error) {
      next(error);
      return;
    }

    const buffer: TurnEvent[] = [];
    let opening = true;
    let closed = false;
    let latestTerminal = false;
    let latestBusy = true;

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      unsubscribe();
      request.log.info({
        message: 'SSE connection closed',
        operation: 'sse_closed',
        conversationId,
        turnId,
      });
    };
    const close = (): void => {
      cleanup();
      response.end();
    };
    const onEvent = (event: TurnEvent): void => {
      if (opening) {
        buffer.push(event);
        return;
      }
      writeEvent(response, event);
      ({ terminal: latestTerminal, busy: latestBusy } = updateState(
        latestTerminal,
        latestBusy,
        event,
      ));
      if (latestTerminal && !latestBusy) close();
    };
    const unsubscribe = publisher.subscribe(turnId, onEvent);
    response.once('close', cleanup);

    try {
      const snapshot = await conversationService.getTurnSnapshot(conversationId, turnId);
      if (closed) return;
      response.status(200);
      response.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      response.flushHeaders();
      request.log.info({
        message: 'SSE connection established',
        operation: 'sse_connected',
        conversationId,
        turnId,
      });

      for (const event of snapshotEvents(snapshot)) writeEvent(response, event);
      latestTerminal = isTerminal(snapshot.turn.status);
      latestBusy = snapshot.hasWorkInProgress;

      const remaining = buffer
        .filter(event => !isRepresented(event, snapshot))
        .sort((left, right) => left.data.eventSequence - right.data.eventSequence);
      opening = false;
      for (const event of remaining) {
        writeEvent(response, event);
        ({ terminal: latestTerminal, busy: latestBusy } = updateState(
          latestTerminal,
          latestBusy,
          event,
        ));
      }
      if (latestTerminal && !latestBusy) close();
    } catch (error) {
      cleanup();
      next(error);
    }
  };
}

function snapshotEvents(snapshot: TurnEventSnapshot): TurnEvent[] {
  const eventSequence = snapshot.lastEventSequence;
  return [
    ...snapshot.turn.responses.map(response => ({
      event: 'slot_update' as const,
      data: {
        conversationId: snapshot.conversationId,
        turnId: snapshot.turnId,
        eventSequence,
        response,
      },
    })),
    {
      event: 'turn_update',
      data: {
        conversationId: snapshot.conversationId,
        turnId: snapshot.turnId,
        eventSequence,
        turn: {
          id: snapshot.turn.id,
          status: snapshot.turn.status,
          updatedAt: snapshot.turn.updatedAt,
        },
      },
    },
    {
      event: 'busy_update',
      data: {
        conversationId: snapshot.conversationId,
        turnId: snapshot.turnId,
        eventSequence,
        hasWorkInProgress: snapshot.hasWorkInProgress,
        updatedAt: snapshot.updatedAt,
      },
    },
  ];
}

function isRepresented(event: TurnEvent, snapshot: TurnEventSnapshot): boolean {
  if (event.event === 'slot_update') {
    const persisted = snapshot.turn.responses.find(({ slot }) => slot === event.data.response.slot);
    return persisted ? compareResponse(event.data.response, event.data.eventSequence, persisted, snapshot.lastEventSequence) <= 0 : false;
  }
  const persistedUpdatedAt = event.event === 'turn_update'
    ? snapshot.turn.updatedAt
    : snapshot.updatedAt;
  return compareVersion(
    event.event === 'turn_update' ? event.data.turn.updatedAt : event.data.updatedAt,
    0,
    event.data.eventSequence,
    persistedUpdatedAt,
    0,
    snapshot.lastEventSequence,
  ) <= 0;
}

function compareResponse(
  candidate: ModelResponse,
  candidateSequence: number,
  persisted: ModelResponse,
  persistedSequence: number,
): number {
  return compareVersion(
    candidate.updatedAt,
    candidate.attemptNo,
    candidateSequence,
    persisted.updatedAt,
    persisted.attemptNo,
    persistedSequence,
  );
}

function compareVersion(
  candidateUpdatedAt: string,
  candidateAttempt: number,
  candidateSequence: number,
  persistedUpdatedAt: string,
  persistedAttempt: number,
  persistedSequence: number,
): number {
  const timestamp = candidateUpdatedAt.localeCompare(persistedUpdatedAt);
  if (timestamp !== 0) return timestamp;
  if (candidateAttempt !== persistedAttempt) return candidateAttempt - persistedAttempt;
  return candidateSequence - persistedSequence;
}

function updateState(
  terminal: boolean,
  busy: boolean,
  event: TurnEvent,
): { terminal: boolean; busy: boolean } {
  if (event.event === 'turn_update') terminal = isTerminal(event.data.turn.status);
  if (event.event === 'busy_update') busy = event.data.hasWorkInProgress;
  return { terminal, busy };
}

function isTerminal(status: TurnStatus): boolean {
  return status === 'completed' || status === 'partial' || status === 'failed';
}

function writeEvent(response: Response, event: TurnEvent): void {
  response.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
