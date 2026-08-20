import type { TurnEvent } from '../../types/sse.js';

type WithoutEventSequence<Event extends TurnEvent> = Event extends TurnEvent
  ? Event['data'] extends infer Data
    ? Data extends { eventSequence: number }
      ? { event: Event['event']; data: Omit<Data, 'eventSequence'> }
      : never
    : never
  : never;

export type UnsequencedTurnEvent = WithoutEventSequence<TurnEvent>;

type TurnEventListener = (event: TurnEvent) => void;

export class TurnEventPublisher {
  private readonly listeners = new Map<string, Set<TurnEventListener>>();
  private readonly sequences = new Map<string, number>();

  subscribe(turnId: string, listener: TurnEventListener): () => void {
    const turnListeners = this.listeners.get(turnId) ?? new Set<TurnEventListener>();
    turnListeners.add(listener);
    this.listeners.set(turnId, turnListeners);

    return () => {
      turnListeners.delete(listener);
      if (turnListeners.size === 0) this.listeners.delete(turnId);
    };
  }

  publish(event: UnsequencedTurnEvent): TurnEvent {
    const { turnId } = event.data;
    const eventSequence = this.getLastEventSequence(turnId) + 1;
    const sequencedEvent = {
      ...event,
      data: { ...event.data, eventSequence },
    } as TurnEvent;

    this.sequences.set(turnId, eventSequence);
    for (const listener of this.listeners.get(turnId) ?? []) {
      try {
        listener(sequencedEvent);
      } catch {
        // A disconnected consumer must not interrupt persistence/orchestration.
      }
    }
    return sequencedEvent;
  }

  getLastEventSequence(turnId: string): number {
    return this.sequences.get(turnId) ?? 0;
  }
}
