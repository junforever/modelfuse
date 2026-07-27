# LLM Provider Contract

Este contrato backend es el único límite consumido por orquestación. No supone un
protocolo externo común.

```ts
type ResponseSlot = 'openai' | 'google' | 'minimax' | 'qwen';

type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LlmRequest = {
  operationId: string;
  slot: ResponseSlot;
  messages: LlmMessage[];
  signal: AbortSignal;
};

type LlmMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  currency?: string;
};

type LlmResult = {
  content: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string;
  metrics?: LlmMetrics;
  metadata?: Record<string, string | number | boolean | null>;
};

interface LlmProvider {
  readonly slot: ResponseSlot;
  readonly provider: string;
  readonly model: string;
  generate(request: LlmRequest): Promise<LlmResult>;
}
```

`operationId` correlaciona una ejecución interna; no es `clientRequestId` ni
implementa idempotencia HTTP.

`metrics` reserva el punto de extensión exigido por la constitución. V1 no estima
valores ausentes, no aplica presupuestos por modelo y no persiste tokens/costo.

## Provider Adapters

Existen adapters concretos separados:

- `OpenAiProvider`
- `GoogleProvider`
- `MiniMaxProvider`
- `QwenProvider`

Cada adapter:

1. lee credencial, modelo y endpoint desde configuración backend validada;
2. traduce `LlmMessage[]` al protocolo del deployment;
3. realiza una llamada Axios con timeout/`AbortSignal`;
4. normaliza contenido, identidad, timestamps, métricas informadas y error;
5. mantiene payloads/headers externos dentro del módulo.

Endpoint y versión exactos son configuración del deployment. No se comparten
payloads ni se presupone compatibilidad OpenAI.

## Normalization Rules

- Contenido exitoso no vacío, provider, model y timestamps son requeridos.
- Métricas son opcionales y nunca se infieren.
- Metadata excluye prompts, respuestas, headers y credenciales.
- Cada adapter honra cancelación.
- Orquestación no ramifica por nombre de provider.
- Una llamada `generate()` representa exactamente un intento externo.
- Adapter/orquestador no ejecuta retry automático después de una falla.

## Error Contract

```ts
type LlmErrorCode =
  | 'authentication'
  | 'rate_limited'
  | 'timeout'
  | 'connectivity'
  | 'content_blocked'
  | 'invalid_response'
  | 'provider_error';

type LlmProviderError = {
  code: LlmErrorCode;
  safeMessage: string;
  provider: string;
  model: string;
  recoverable: boolean;
};
```

- Bodies, headers, stacks y credenciales no salen del adapter.
- Credencial rechazada se normaliza como `authentication`.
- Timeout cancela Axios y afecta solo su slot.
- Rate limit, timeout y conectividad pueden ser recuperables.
- `recoverable` habilita elección manual; no programa un retry.

## Registry

El registro es:

```ts
Record<ResponseSlot, LlmProvider>
```

Una instancia por slot, sin factory hierarchy ni protocolo común.

## Context Input

`ContextBuilder` produce mensajes; adapters no consultan PostgreSQL.

### Base slots

Cada base recibe:

1. instrucción de sistema;
2. ventana de prompts/respuestas del mismo slot;
3. prompt actual.

### Qwen

Qwen recibe:

1. instrucción de consolidación;
2. ventana de prompts/consolidaciones Qwen previas;
3. prompt actual;
4. respuestas base completadas del turno actual;
5. indicaciones de ausencias actuales.

Nunca recibe respuestas base históricas.

La evidencia de truncamiento se persiste fuera del provider como ordinales y
booleano; no se guarda `messages`, prompt compuesto ni contenido duplicado. La
ventana no implica presupuesto, estimación o límite de tokens por modelo.

## Retry Contract

- Primera falla recuperable: devolver error al orquestador; cero intentos
  adicionales.
- Retry manual aceptado: una nueva llamada solo al adapter del slot.
- Dos retries del mismo slot no alcanzan simultáneamente al adapter; backend gana
  la transición atómica `failed → pending`.
- Retry base fallido: no llamar Qwen.
- Retry base exitoso: marcar Qwen stale y ejecutar una llamada Qwen.
- Retry Qwen: no llamar bases.
- Continue-without: no llamar ningún provider.

El bloqueo UI de todos los retries durante busy pertenece a frontend; este
contrato solo garantiza exclusión de la misma ejecución de slot.

## Contract Tests

Cada adapter demuestra:

- mapping de system/user/assistant;
- normalización de contenido/métricas informadas;
- credencial rechazada;
- timeout/cancelación;
- respuesta vacía/inválida;
- un solo request externo por `generate()`, incluso ante error recuperable;
- ausencia de secretos/contenido en errores y metadata.
