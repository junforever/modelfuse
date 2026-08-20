import type { StandardApiErrorCode } from '../../types/apiError.js';

export class ConversationError extends Error {
  constructor(
    readonly status: number,
    readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConversationError';
  }
}

export class DefaultProfileUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'DEFAULT_PROFILE_UNAVAILABLE';

  constructor(readonly missingDeploymentIds: readonly string[]) {
    super('The default deployment profile is unavailable.');
    this.name = 'DefaultProfileUnavailableError';
  }
}
