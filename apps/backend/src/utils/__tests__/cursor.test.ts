import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '../cursor.js';

describe('cursor encoding', () => {
  it('round-trips the opaque payloads used by conversation and turn pagination', () => {
    const payloads = [
      { updatedAt: '2026-08-07T12:34:56.789Z', id: 'conversation-id' },
      { ordinal: 4, id: 'turn-id' },
    ];

    for (const payload of payloads) {
      const encoded = encodeCursor(payload);

      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeCursor(encoded)).toEqual(payload);
    }
  });

  it('rejects malformed base64url, malformed JSON, and non-object payloads', () => {
    const invalidCursors = [
      '*not-base64url*',
      Buffer.from('{', 'utf8').toString('base64url'),
      Buffer.from('null', 'utf8').toString('base64url'),
    ];

    for (const cursor of invalidCursors) {
      expect(() => decodeCursor(cursor)).toThrow('Invalid cursor');
    }
  });
});
