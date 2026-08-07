import type { ModelResponse, TurnResponses } from '../types/conversation';
import type { TurnEvent, TurnEventSnapshot } from '../types/sse';

function isNewerVersion(
  updatedAt: string,
  currentUpdatedAt: string,
  eventSequence: number,
  currentEventSequence: number,
  attemptNo?: number,
  currentAttemptNo?: number
): boolean {
  const timestampDelta = Date.parse(updatedAt) - Date.parse(currentUpdatedAt);

  if (timestampDelta !== 0) return timestampDelta > 0;
  if (attemptNo !== undefined && currentAttemptNo !== undefined && attemptNo !== currentAttemptNo) {
    return attemptNo > currentAttemptNo;
  }
  return eventSequence > currentEventSequence;
}

function replaceResponse(
  responses: TurnResponses,
  nextResponse: ModelResponse
): TurnResponses {
  return responses.map(response =>
    response.slot === nextResponse.slot ? nextResponse : response
  ) as unknown as TurnResponses;
}

export function applyConversationEvent(
  snapshot: TurnEventSnapshot,
  event: TurnEvent
): TurnEventSnapshot {
  const { data } = event;

  if (
    data.conversationId !== snapshot.conversationId ||
    data.turnId !== snapshot.turnId ||
    data.eventSequence <= snapshot.lastEventSequence
  ) {
    return snapshot;
  }

  if (event.event === 'slot_update') {
    const currentResponse = snapshot.turn.responses.find(
      response => response.slot === data.response.slot
    );

    if (
      !currentResponse ||
      !isNewerVersion(
        data.response.updatedAt,
        currentResponse.updatedAt,
        data.eventSequence,
        snapshot.lastEventSequence,
        data.response.attemptNo,
        currentResponse.attemptNo
      )
    ) {
      return snapshot;
    }

    return {
      ...snapshot,
      turn: {
        ...snapshot.turn,
        responses: replaceResponse(snapshot.turn.responses, data.response),
      },
      lastEventSequence: data.eventSequence,
    };
  }

  if (event.event === 'turn_update') {
    if (
      data.turn.id !== snapshot.turn.id ||
      !isNewerVersion(
        data.turn.updatedAt,
        snapshot.turn.updatedAt,
        data.eventSequence,
        snapshot.lastEventSequence
      )
    ) {
      return snapshot;
    }

    return {
      ...snapshot,
      turn: {
        ...snapshot.turn,
        status: data.turn.status,
        updatedAt: data.turn.updatedAt,
      },
      lastEventSequence: data.eventSequence,
    };
  }

  if (
    !isNewerVersion(
      data.updatedAt,
      snapshot.updatedAt,
      data.eventSequence,
      snapshot.lastEventSequence
    )
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    hasWorkInProgress: data.hasWorkInProgress,
    updatedAt: data.updatedAt,
    lastEventSequence: data.eventSequence,
  };
}
