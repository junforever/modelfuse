# Phase 0 Research: ModelFuse

## Decision 1: Monolito modular en el monorepo actual

**Decision**: Mantener `apps/frontend`, `apps/backend`, `packages/ui` y `db` como
límites principales.

**Rationale**: El repositorio ya separa presentación, API/orquestación, UI
reutilizable y esquema. La aplicación privada monousuario no requiere despliegues
independientes.

**Alternatives considered**: Microservicios por provider o nuevos workspaces;
añaden coordinación sin cubrir requisitos adicionales.

## Decision 2: REST asíncrono con polling

**Decision**: Persistir conversación, turno y slots antes de responder `202`.
TanStack Query consulta después el recurso mientras haya trabajo no terminal.

**Rationale**: SC-010 fija `202` y el producto necesita cuatro estados
independientes, no streaming.

**Alternatives considered**: POST bloqueante, SSE, WebSockets y cola externa. No
son necesarios para el comportamiento de v1.

La cadencia de polling es configuración técnica, no regla de producto.

## Decision 3: Busy exclusivo por conversación

**Decision**: Una conversación admite un solo turno con trabajo en curso. Busy es
verdadero si cualquier turno o slot de esa conversación está `pending` o
`running`. Backend rechaza un turno nuevo con `409 CONVERSATION_BUSY`.

**Rationale**: Esta es la política cerrada de v1. Mantiene orden conversacional y
evita construir un nuevo contexto mientras el anterior aún cambia.

**Implementation**:

1. Replay idempotente se resuelve primero.
2. Para un nuevo ID, la transacción bloquea brevemente la conversación.
3. Consulta turnos y slots activos.
4. Un índice único parcial impide dos turnos `pending`/`running`.
5. El lock termina antes de llamar providers.

**Alternatives considered**: Exclusión global o múltiples turnos activos por
conversación. Ambas contradicen la decisión cerrada; otras conversaciones siguen
siendo navegables y procesables.

## Decision 4: Busy visible y accionable en frontend

**Decision**: `ConversationDetail.hasWorkInProgress` controla la UI. Mientras sea
verdadero, Enviar y todos los retries de esa conversación quedan disabled y se
muestra un aviso de procesamiento. Cuando ya no hay estados `pending`/`running`,
las acciones válidas se reactivan aunque el turno sea `failed` o `partial`.

**Rationale**: Evita dobles emisores de trabajo y mantiene la regla por
conversación, no por aplicación.

**Interaction with first failure**: Retry y Continue-without se muestran al
primer fallo recuperable. Si otros slots siguen activos, Retry aparece disabled;
Continue-without permanece disponible porque no invoca providers.

**Alternatives considered**: Ocultar acciones hasta terminar o bloquear toda la
aplicación. No cumplen la visibilidad inmediata ni el alcance por conversación.

## Decision 5: Idempotencia sin tabla adicional

**Decision**:

- `conversations.create_client_request_id` es UUID único para
  `POST /conversations`;
- `turns.client_request_id` es UUID único dentro de su conversación para
  `POST /conversations/:id/turns`;
- frontend genera el UUID con `crypto.randomUUID()` una vez por submit lógico;
- repetir el ID devuelve el recurso original y no reinicia providers.
- reutilizar el ID con un prompt diferente devuelve
  `409 CLIENT_REQUEST_ID_CONFLICT`.

**Rationale**: Dos columnas y constraints nativos cubren doble click y replay HTTP
sin una tabla o framework de idempotencia.

**Ordering**: El lookup del ID ocurre antes del busy check. Por tanto, repetir un
request ya aceptado devuelve su turno aunque la conversación continúe busy.

**Alternatives considered**: Tabla genérica de idempotency keys, cache en memoria
o deduplicación por prompt. Añaden infraestructura, pierden persistencia o
confunden prompts iguales con el mismo submit.

## Decision 6: Retry manual y exclusión atómica por slot

**Decision**: Cada acción Retry ejecuta exactamente un intento. Backend solo
transiciona atómicamente `failed → pending`; si el mismo slot ya está `pending` o
`running`, responde `409 RESPONSE_RETRY_IN_PROGRESS`.

**Rationale**: Satisface retry manual, impide dos retries simultáneos del mismo
slot y no requiere tabla de intentos.

**Rules**:

1. No hay backoff ni retry automático de adapters/orquestador.
2. UI no inicia retry mientras la conversación tenga cualquier trabajo activo.
3. Backend rechaza con busy un retry que convertiría en activo un segundo turno.
4. Retry base fallido no invoca Qwen.
5. Retry base exitoso marca stale la consolidación y genera una nueva con Qwen.
6. Retry Qwen no ejecuta bases.

**Alternatives considered**: Retry del turno completo, retry automático o mutex
en memoria. Contradicen las reglas o no sobreviven múltiples procesos/restarts.

Cada slot mantiene un contador `attempt_no`; completion/error solo se guarda si el
contador sigue vigente. Así una respuesta tardía no sobrescribe un retry posterior
sin crear tabla de intentos.

## Decision 7: Continue-without no es trabajo en curso

**Decision**: Continue-without solo actualiza un slot base `failed`, persiste
`continued_without_at` y no cambia el slot a `pending`/`running`.

**Rationale**: Permite tomar la decisión inmediatamente, incluso mientras otros
slots del mismo turno siguen ejecutándose, sin violar el bloqueo de emisores de
trabajo.

**Alternatives considered**: Invocar Qwen o crear otro turno desde esta acción;
no están definidos y añadirían trabajo.

## Decision 8: Cuatro adapters separados y contrato normalizado

**Decision**: OpenAI, Google, MiniMax y Qwen usan adapters independientes sobre
Axios. Cada deployment traduce su protocolo a `LlmResult`/`LlmProviderError`.

**Rationale**: FR-036 prohíbe asumir un protocolo común. Axios ya existe y evita
añadir SDKs preventivos.

**Alternatives considered**: Adapter OpenAI-compatible compartido o cuatro SDKs.
El primero viola FR-036; los SDKs se añaden solo si un endpoint concreto los
necesita.

Endpoint, versión y deployment son configuración del adapter, no regla de
producto.

## Decision 9: Contexto acotado con evidencia segura

**Decision**: `ContextBuilder` selecciona una ventana configurable de turnos
relevantes y persiste únicamente:

- `truncated`;
- primer ordinal incluido;
- último ordinal incluido.

**Rationale**: Permite explicar la ventana sin copiar el prompt compuesto,
respuestas ni contexto sensible.

**Isolation**:

- cada base recibe solo su historial y prompt actual;
- Qwen recibe su historial consolidado, prompt actual y respuestas base actuales;
- Qwen nunca recibe historiales base.

**Alternatives considered**: Historial completo, copia del contexto compuesto,
resumen automático o presupuesto por modelo. Respectivamente puede exceder
límites, duplica contenido sensible o introduce políticas no definidas.

La ventana no es presupuesto, estimación ni límite de tokens por modelo.

## Decision 10: Recovery dedicado antes de HTTP

**Decision**: `server.ts` ejecuta `recoverInterruptedTurns()` antes de `listen()`;
`index.ts` solo llama start/stop. Recovery termina slots persistidos
`pending`/`running`, recalcula turnos y busy, y no relanza providers.

**Rationale**: El trabajo en memoria no sobrevive reinicios. La reconciliación
libera conversaciones atascadas y conserva resultados completados.

**Alternatives considered**: Recovery en `index.ts` o reanudación automática;
violan FR-037 o requieren ejecución durable no especificada.

## Decision 11: Cursores para historial y sidebar

**Decision**:

- sidebar por cursor `(updated_at,id)` y página configurada;
- chat por `(ordinal,id)` en bloques de hasta tres turnos completos.

**Rationale**: Cumple ambos scrolls infinitos sin controles de paginación y
mantiene páginas estables ante inserciones.

## Decision 12: Título y colapso deterministas

**Decision**: Backend genera `prompt.trim().slice(0,80)`. El frontend colapsa
mensajes históricos según `VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD` usando estado
local.

**Rationale**: Son las implementaciones directas de FR-039/FR-042.

## Decision 13: Dos módulos Liquibase

**Decision**: `conversations` crea conversaciones/turnos; `messages` crea slots e
índices. Los XML se incluyen desde el master.

**Rationale**: Son los límites persistentes reales. Constraints PostgreSQL
implementan idempotencia, ordinales, turno activo y slot único sin nuevas tablas.

## Decision 14: Evaluación y observabilidad mínimas

**Decision**: SC-005 usa un fixture versionado de máximo cinco casos y checks
simples, con umbral del 90%. Pino registra IDs técnicos, busy, replay, slot,
duración y estado sin contenido. El contrato LLM reserva métricas opcionales, pero
v1 no estima ni persiste tokens/costo.

**Rationale**: Hace aceptación y diagnóstico verificables sin ranking, dashboard
ni plataforma de trazas.

## Acceptance Scope

- SC-002 se valida en el 100% de los casos del conjunto de prueba de recovery al
  recrear app/servicios sobre la misma DB. No es una afirmación global.
- SC-010 exige `202` y menos de un segundo para create y primera página de
  historial en al menos el 95% de ejecuciones del conjunto local controlado con
  providers fake. No se endurece a 100%.

## Resolved Unknowns

Concurrencia, busy UI, idempotencia, retry, primera falla, ventana contextual y
alcances de aceptación están cerrados según la solicitud de v1.
