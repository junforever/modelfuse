import type { LlmErrorCode } from '../../types/llm.js';

export function isRecoverableLlmError(code: LlmErrorCode): boolean {
  return (
    code === 'rate_limited' ||
    code === 'timeout' ||
    code === 'connectivity' ||
    code === 'provider_transient_error'
  );
}
