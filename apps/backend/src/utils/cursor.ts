export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidCursorError';
  }
}

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new InvalidCursorError();

    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) throw new InvalidCursorError();

    const payload: unknown = JSON.parse(decoded.toString('utf8'));
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new InvalidCursorError();
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError();
  }
}
