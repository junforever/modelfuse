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
  // The six field-specific events in an opening snapshot share one sequence.
  if (
    event.data.conversationId !== snapshot.conversationId ||
    event.data.turnId !== snapshot.turnId ||
    event.data.eventSequence < snapshot.lastEventSequence
  ) {
    return snapshot;
  }

  if (event.event === 'slot_update') {
    const currentResponse = snapshot.turn.responses.find(
      response => response.slot === event.data.response.slot
    );

    if (
      !currentResponse ||
      !isNewerVersion(
        event.data.response.updatedAt,
        currentResponse.updatedAt,
        event.data.eventSequence,
        snapshot.lastEventSequence,
        event.data.response.attemptNo,
        currentResponse.attemptNo
      )
    ) {
      return snapshot;
    }

    return {
      ...snapshot,
      turn: {
        ...snapshot.turn,
        responses: replaceResponse(snapshot.turn.responses, event.data.response),
      },
      lastEventSequence: event.data.eventSequence,
    };
  }

  if (event.event === 'turn_update') {
    if (
      event.data.turn.id !== snapshot.turn.id ||
      !isNewerVersion(
        event.data.turn.updatedAt,
        snapshot.turn.updatedAt,
        event.data.eventSequence,
        snapshot.lastEventSequence
      )
    ) {
      return snapshot;
    }

    return {
      ...snapshot,
      turn: {
        ...snapshot.turn,
        status: event.data.turn.status,
        updatedAt: event.data.turn.updatedAt,
      },
      lastEventSequence: event.data.eventSequence,
    };
  }

  if (
    !isNewerVersion(
      event.data.updatedAt,
      snapshot.updatedAt,
      event.data.eventSequence,
      snapshot.lastEventSequence
    )
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    hasWorkInProgress: event.data.hasWorkInProgress,
    updatedAt: event.data.updatedAt,
    lastEventSequence: event.data.eventSequence,
  };
}
