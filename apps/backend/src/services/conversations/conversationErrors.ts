import type { ApiErrorCode } from '../../types/apiError.js';

export class ConversationError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConversationError';
  }
}
