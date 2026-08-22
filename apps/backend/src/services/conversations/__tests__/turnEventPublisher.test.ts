import { describe, expect, it, vi } from 'vitest';

import { createConversationFixture } from '../../../test/fixtures/conversationFixtures.js';
import type { ResponseSlot } from '../../../types/conversations.js';
import type { TurnEvent } from '../../../types/sse.js';
import { TurnEventPublisher } from '../turnEventPublisher.js';

const conversationId = '00000000-0000-4000-8000-000000000001';

function slotUpdate(turnId: string, slot: ResponseSlot, content: string) {
  const storedResponse = createConversationFixture().turn.responses.find(
    response => response.slot === slot
  );
  if (!storedResponse) throw new Error(`Missing canonical fixture slot: ${slot}`);
  const response = {
    ...storedResponse,
    content,
    updatedAt: '2026-08-07T10:00:00.000Z',
    attemptNo: 1,
  };

  return {
    event: 'slot_update' as const,
    data: { conversationId, turnId, response },
  };
}

describe('TurnEventPublisher', () => {
  it('delivers events in publication order with a strictly increasing sequence per turn', () => {
    const publisher = new TurnEventPublisher();
    const turnAEvents = vi.fn<(event: TurnEvent) => void>();
    const turnBEvents = vi.fn<(event: TurnEvent) => void>();
    publisher.subscribe('turn-a', turnAEvents);
    publisher.subscribe('turn-b', turnBEvents);

    const firstA = publisher.publish(slotUpdate('turn-a', 'base-1', 'first same-version value'));
    const firstB = publisher.publish(slotUpdate('turn-b', 'base-2', 'independent turn value'));
    const secondA = publisher.publish(
      slotUpdate('turn-a', 'consolidator', 'second same-version value')
    );

    expect([firstA.data.eventSequence, secondA.data.eventSequence]).toEqual([1, 2]);
    expect(firstB.data.eventSequence).toBe(1);
    expect(
      turnAEvents.mock.calls.map(([event]) =>
        event.event === 'slot_update'
          ? {
              sequence: event.data.eventSequence,
              slot: event.data.response.slot,
              role: event.data.response.role,
              content: event.data.response.content,
            }
          : null
      )
    ).toEqual([
      {
        sequence: 1,
        slot: 'base-1',
        role: 'base',
        content: 'first same-version value',
      },
      {
        sequence: 2,
        slot: 'consolidator',
        role: 'consolidator',
        content: 'second same-version value',
      },
    ]);
    expect(turnBEvents).toHaveBeenCalledOnce();
    expect(publisher.getLastEventSequence('turn-a')).toBe(2);
    expect(publisher.getLastEventSequence('turn-b')).toBe(1);
  });

  it('stops delivery immediately after unsubscribe', () => {
    const publisher = new TurnEventPublisher();
    const listener = vi.fn<(event: TurnEvent) => void>();
    const unsubscribe = publisher.subscribe('turn-a', listener);

    publisher.publish(slotUpdate('turn-a', 'base-1', 'before unsubscribe'));
    unsubscribe();
    publisher.publish(slotUpdate('turn-a', 'base-1', 'after unsubscribe'));

    expect(listener).toHaveBeenCalledOnce();
    const delivered = listener.mock.calls[0]?.[0];
    expect(delivered?.event).toBe('slot_update');
    if (delivered?.event === 'slot_update') {
      expect(delivered.data.response.content).toBe('before unsubscribe');
    }
  });

  it('continues delivering an event when another listener throws', () => {
    const publisher = new TurnEventPublisher();
    const healthyListener = vi.fn<(event: TurnEvent) => void>();
    publisher.subscribe('turn-a', () => {
      throw new Error('disconnected listener');
    });
    publisher.subscribe('turn-a', healthyListener);

    expect(() =>
      publisher.publish(slotUpdate('turn-a', 'consolidator', 'terminal value'))
    ).not.toThrow();
    expect(healthyListener).toHaveBeenCalledOnce();
    expect(healthyListener.mock.calls[0]?.[0].data.eventSequence).toBe(1);
  });
});
