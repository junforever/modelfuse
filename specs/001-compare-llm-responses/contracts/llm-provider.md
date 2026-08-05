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

type InputTokenMeasurement =
  | { kind: 'exact'; tokens: number }
  | { kind: 'upper_bound'; tokens: number; basis: string };

type LlmContextCapabilities = {
  limitTokens: number;
  measureInputTokens(messages: LlmMessage[]): InputTokenMeasurement;
};

interface LlmProvider {
  readonly slot: ResponseSlot;
  readonly provider: string;
  readonly model: string;
  readonly context: LlmContextCapabilities;
  generate(request: LlmRequest): Promise<LlmResult>;
}
```

`operationId` correlaciona una ejecución interna; no es `clientRequestId` ni
implementa idempotencia HTTP.

`metrics` reserva el punto de extensión exigido por la constitución. V1 no infiere
valores ausentes, no aplica presupuestos de producto y no persiste tokens/costo.
`measureInputTokens` es solo validación técnica previa; su resultado no entra en
`metrics` ni se persiste.

Cada adapter/deployment implementa uno de estos modos:

- `exact`: contador/tokenizer compatible que incluye mensajes y overhead del
  envelope;
- `upper_bound`: cota conservadora documentada y demostrable para el tokenizer,
  versión y envelope configurados.

Ningún modo puede subestimar. No existe un estimador genérico compartido basado
solo en bytes o caracteres. Un deployment requiere una implementación cuya
garantía esté cubierta por contract tests.

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
5. expone el límite técnico configurado y un medidor exacto o cota superior
   verificable para el deployment;
6. mantiene payloads/headers externos dentro del módulo.

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
  | 'invalid_prompt_size'
  | 'invalid_response'
  | 'provider_transient_error'
  | 'provider_error';

type LlmProviderError = {
  code: LlmErrorCode;
  safeMessage: string;
  provider: string;
  model: string;
  recoverable: boolean;
};
```

La clasificación es normativa y total:

| `LlmErrorCode` | `recoverable` |
|---|---:|
| `authentication` | `false` |
| `rate_limited` | `true` |
| `timeout` | `true` |
| `connectivity` | `true` |
| `content_blocked` | `false` |
| `invalid_prompt_size` | `false` |
| `invalid_response` | `false` |
| `provider_transient_error` | `true` |
| `provider_error` | `false` |

Los adapters traducen la condición upstream únicamente a `LlmErrorCode`. El
helper común `isRecoverableLlmError(code)` completa `recoverable`; ningún adapter
puede elegir o sobrescribir el booleano. Un 5xx, saturación u otra falla temporal
no cubierta por un código más específico se normaliza como
`provider_transient_error`; una falla permanente no cubierta se normaliza como
`provider_error`.

- Bodies, headers, stacks y credenciales no salen del adapter.
- Credencial rechazada se normaliza como `authentication` y no ofrece Retry.
- Timeout cancela Axios y afecta solo su slot.
- Rate limit, timeout y conectividad son recuperables según la tabla canónica.
- `invalid_prompt_size` se produce antes de `generate()` si ContextBuilder no
  puede construir un payload válido; se persiste/proyecta como
  `INVALID_PROMPT_SIZE`, es seguro y afecta solo su slot.
- `recoverable` habilita Retry manual; no programa un retry. Continue-without se
  rige por el estado `failed` del slot base y no altera esta clasificación.
- `interrupted` es un error seguro de orquestación, no un `LlmErrorCode`; recovery
  siempre lo persiste con `recoverable=true`.

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

Antes de `generate()`, `ContextBuilder`:

1. construye la ventana por turnos;
2. obtiene `limitTokens` y aplica `LLM_CONTEXT_THRESHOLD_RATIO`, default `0.8`;
3. llama `measureInputTokens` y usa `tokens` como conteo o límite superior;
4. elimina turnos antiguos y, si hace falta, recorta contenido contextual
   auxiliar preservando roles, etiquetas y prompt actual;
5. vuelve a estimar hasta quedar bajo el umbral;
6. devuelve `invalid_prompt_size` sin llamar al adapter si el payload mínimo no
   cabe.

La evidencia se persiste fuera del provider como ordinales, booleano y tipo de
protección. No se guardan `messages`, prompt compuesto, mediciones, límites ni
contenido duplicado. Esta protección técnica no implica presupuesto ni
contabilidad de tokens por modelo.

## Retry Contract

- Primera falla recuperable: devolver error al orquestador; cero intentos
  adicionales.
- Retry manual aceptado: una nueva llamada solo al adapter del slot.
- Dos retries del mismo slot no alcanzan simultáneamente al adapter; backend gana
  la transición atómica `failed → pending`.
- Retry base fallido: no llamar Qwen.
- Retry base exitoso: marcar Qwen stale y ejecutar una llamada Qwen.
- Retry Qwen: no llamar bases.
- Continue-without: no llamar ningún provider, excluir permanentemente el slot de
  retry y omitirlo en cualquier consolidación posterior del turno.

El bloqueo UI de todos los retries durante busy pertenece a frontend; este
contrato solo garantiza exclusión de la misma ejecución de slot.

## Contract Tests

Cada adapter demuestra:

- mapping de system/user/assistant;
- normalización de contenido/métricas informadas;
- traducción de condiciones upstream a los códigos comunes y aplicación de la
  misma matriz canónica de recuperabilidad;
- credencial rechazada;
- timeout/cancelación;
- medición técnica y límite configurado del deployment;
- corpus con ASCII, puntuación densa, Unicode, emoji, scripts no latinos y
  contenido fragmentado/con delimitadores;
- igualdad contra el conteo de referencia en modo exacto o
  `measurement.tokens >= referenceTokens` en modo `upper_bound`;
- inclusión del overhead de roles/envelope y nueva validación después de cada
  compactación;
- no invocar `generate()` cuando ContextBuilder produce `invalid_prompt_size`;
- respuesta vacía/inválida;
- un solo request externo por `generate()`, incluso ante error recuperable;
- ausencia de secretos/contenido en errores y metadata.
