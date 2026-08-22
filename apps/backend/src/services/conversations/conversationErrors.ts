import type { StandardApiErrorCode } from '../../types/apiError.js';

export class ConversationError extends Error {
  constructor(
    readonly status: number,
    readonly code: StandardApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ConversationError';
  }
}

export class DuplicateDeploymentAssignmentError extends ConversationError {
  constructor() {
    super(
      422,
      'DUPLICATE_DEPLOYMENT_ASSIGNMENT',
      'A deployment cannot be assigned to more than one slot.'
    );
    this.name = 'DuplicateDeploymentAssignmentError';
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
