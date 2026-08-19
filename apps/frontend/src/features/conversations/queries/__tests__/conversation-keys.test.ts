import { describe, expect, it } from 'vitest';

import { conversationKeys } from '../conversation-keys';

describe('conversation query keys', () => {
  it('builds stable keys from resource IDs and cursors', () => {
    expect(conversationKeys.all).toEqual(['conversations']);
    expect(conversationKeys.list('next-page')).toEqual([
      'conversations',
      'list',
      { cursor: 'next-page' },
    ]);
    expect(conversationKeys.detail('conversation-1')).toEqual([
      'conversations',
      'detail',
      'conversation-1',
    ]);
    expect(conversationKeys.turns('conversation-1', 'older-page')).toEqual([
      'conversations',
      'detail',
      'conversation-1',
      'turns',
      { before: 'older-page' },
    ]);
    expect(conversationKeys.turn('conversation-1', 'turn-1')).toEqual([
      'conversations',
      'detail',
      'conversation-1',
      'turns',
      'turn-1',
    ]);

    expect(conversationKeys.turn('conversation-1', 'turn-1')).toEqual(
      conversationKeys.turn('conversation-1', 'turn-1')
    );
    expect(conversationKeys.turn('conversation-1', 'turn-2')).not.toEqual(
      conversationKeys.turn('conversation-1', 'turn-1')
    );
  });
});
