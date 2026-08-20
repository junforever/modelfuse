export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_CURSOR'
  | 'CONVERSATION_NOT_FOUND'
  | 'TURN_NOT_FOUND'
  | 'RESPONSE_NOT_FOUND'
  | 'CLIENT_REQUEST_ID_CONFLICT'
  | 'CONVERSATION_BUSY'
  | 'RESPONSE_NOT_RETRYABLE'
  | 'RESPONSE_RETRY_IN_PROGRESS'
  | 'CONTINUE_WITHOUT_NOT_ALLOWED'
  | 'DEPLOYMENT_UNAVAILABLE'
  | 'DEFAULT_PROFILE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export type StandardApiErrorCode = Exclude<ApiErrorCode, 'DEFAULT_PROFILE_UNAVAILABLE'>;

export interface StandardApiError {
  code: StandardApiErrorCode;
  message: string;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
}

export interface DefaultProfileUnavailableApiError {
  code: 'DEFAULT_PROFILE_UNAVAILABLE';
  message: string;
  requestId: string;
  missingDeploymentIds: readonly string[];
}

export type ApiError = StandardApiError | DefaultProfileUnavailableApiError;
