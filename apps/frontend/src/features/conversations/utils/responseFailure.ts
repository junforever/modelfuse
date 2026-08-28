import { RESPONSE_SLOT_LABELS, type ModelResponse } from '../types/conversation';

const FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  authentication: 'el proveedor no está disponible por un problema de configuración.',
  connectivity: 'no se pudo establecer la conexión con el proveedor.',
  content_blocked: 'el proveedor bloqueó la solicitud por sus políticas de contenido.',
  invalid_response: 'el proveedor devolvió una respuesta no válida.',
  provider_error: 'el proveedor devolvió un error.',
  provider_transient_error: 'el proveedor tuvo un fallo temporal.',
  rate_limited: 'el proveedor está temporalmente saturado.',
  timeout: 'se agotó el tiempo de espera del proveedor.',
};

export function responseFailureMessage(response: ModelResponse): string {
  const detail =
    FAILURE_MESSAGES[response.error?.code ?? ''] ?? 'el proveedor devolvió un error no identificado.';

  return `Falló el proveedor asignado a ${RESPONSE_SLOT_LABELS[response.slot]}: ${detail}`;
}
