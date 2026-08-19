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
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
}
