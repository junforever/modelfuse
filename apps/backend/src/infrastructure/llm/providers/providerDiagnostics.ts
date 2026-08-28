import axios from 'axios';

import type { LlmRequest } from '../../../types/llm.js';
import { logger } from '../../../utils/logger.js';

export interface ProviderRequestTrace {
  provider: string;
  slot: LlmRequest['slot'];
  model: string;
  method: 'POST';
  endpoint: string;
  protocol?: string;
  hostname?: string;
  port?: string;
  timeoutMs: number;
  messageCount: number;
  inputChars: number;
  maxOutputTokens: number;
  signalAborted: boolean;
}

export function createProviderRequestTrace(
  provider: string,
  endpoint: string,
  timeoutMs: number,
  request: LlmRequest
): ProviderRequestTrace {
  let url: URL | undefined;
  try {
    url = new URL(endpoint);
  } catch {
    // The provider will report the invalid endpoint through its normal error path.
  }

  return {
    provider,
    slot: request.slot,
    model: request.deployment.modelId,
    method: 'POST',
    endpoint: url ? `${url.origin}${url.pathname}` : '<invalid-endpoint>',
    ...(url
      ? {
          protocol: url.protocol,
          hostname: url.hostname,
          ...(url.port ? { port: url.port } : {}),
        }
      : {}),
    timeoutMs,
    messageCount: request.messages.length,
    inputChars: request.messages.reduce((total, message) => total + message.content.length, 0),
    maxOutputTokens: request.deployment.maxOutputTokens,
    signalAborted: request.signal?.aborted ?? false,
  };
}

export function logProviderRequestStarted(trace: ProviderRequestTrace): void {
  safelyLog(() =>
    logger.info(
      {
        ...trace,
        operation: 'provider_http_started',
      },
      'Provider HTTP request started'
    )
  );
}

export function logProviderRequestCompleted(
  trace: ProviderRequestTrace,
  durationMs: number,
  status: number
): void {
  safelyLog(() =>
    logger.info(
      {
        ...trace,
        operation: 'provider_http_completed',
        durationMs,
        status,
      },
      'Provider HTTP request completed'
    )
  );
}

export function logProviderRequestFailed(
  trace: ProviderRequestTrace,
  durationMs: number,
  error: unknown
): void {
  safelyLog(() => {
    const details = axios.isAxiosError(error)
      ? {
          axiosError: true,
          errorName: error.name,
          errorCode: error.code,
          requestCreated: Boolean(error.request),
          responseStatus: error.response?.status,
          responseStatusText: preview(error.response?.statusText),
          responseBodyPreview: preview(error.response?.data),
          proxyConfigured: error.config?.proxy !== undefined,
          cause: describeCause((error as typeof error & { cause?: unknown }).cause),
          socket: describeSocket(error.request),
        }
      : {
          axiosError: false,
          errorName: error instanceof Error ? error.name : undefined,
          errorCode: error instanceof Error ? (error as Error & { code?: string }).code : undefined,
          cause: describeCause(error),
        };

    logger.error(
      {
        ...trace,
        operation: 'provider_http_failed',
        durationMs,
        ...details,
      },
      'Provider HTTP request failed with diagnostic trace'
    );
  });
}

function describeCause(value: unknown): Record<string, string> | undefined {
  if (!value) return undefined;
  if (value instanceof Error) {
    const cause = value as Error & { code?: string };
    return {
      name: cause.name,
      ...(cause.code ? { code: cause.code } : {}),
    };
  }
  return { name: typeof value };
}

function describeSocket(value: unknown): Record<string, string | boolean | undefined> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const socket = (value as { socket?: unknown }).socket;
  if (!socket || typeof socket !== 'object') return undefined;
  const candidate = socket as {
    authorized?: boolean;
    authorizationError?: string;
    alpnProtocol?: string;
    servername?: string;
    remoteAddress?: string;
    remotePort?: number;
  };
  return {
    authorized: candidate.authorized,
    authorizationError: candidate.authorizationError,
    alpnProtocol: candidate.alpnProtocol,
    servername: candidate.servername,
    remoteAddress: candidate.remoteAddress,
    remotePort: candidate.remotePort === undefined ? undefined : String(candidate.remotePort),
  };
}

function preview(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  let serialized: string;
  try {
    serialized = typeof value === 'string' ? value : JSON.stringify(value, redactionReplacer);
  } catch {
    return '<unserializable>';
  }
  return (serialized ?? '<unserializable>')
    .replace(
      /(authorization|api[_-]?key|access[_-]?token|password|prompt|messages|content)\s*([:=])\s*("(?:[^"\\]|\\.)*"|[^,}\s]+)/gi,
      '$1$2<redacted>'
    )
    .slice(0, 4000);
}

function redactionReplacer(key: string, value: unknown): unknown {
  if (/(authorization|api[_-]?key|access[_-]?token|password|prompt|messages|content)/i.test(key)) {
    return '<redacted>';
  }
  return value;
}

function safelyLog(write: () => void): void {
  try {
    write();
  } catch {
    // Diagnostics must never replace or mask the provider error.
  }
}
