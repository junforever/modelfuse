# Phase 0 Research: ModelFuse

## Decision 1: Monolito modular en el monorepo actual

**Decision**: Mantener `apps/frontend`, `apps/backend`, `packages/ui` y `db` como
límites principales.

**Rationale**: El repositorio ya separa presentación, API/orquestación, UI
reutilizable y esquema. La aplicación privada monousuario no requiere despliegues
independientes.

**Alternatives considered**: Microservicios por provider o nuevos workspaces;
añaden coordinación sin cubrir requisitos adicionales.

## Decision 2: Arquitectura híbrida REST + SSE

**Decision**: Persistir conversación, turno y slots antes de responder `202`.
REST conserva comandos y lecturas persistidas. Después, el frontend abre un
`EventSource` por turno sobre
`GET /api/v1/conversations/:conversationId/turns/:turnId/events` y recibe
`slot_update`, `turn_update` y el `busy_update` explícito.

El endpoint emite primero el snapshot PostgreSQL vigente y luego eventos
posteriores al commit desde un publicador en memoria del monolito. Al terminar el
turno y quedar `hasWorkInProgress=false`, frontend y backend pueden cerrar el
stream. Una conexión nueva obtiene otro snapshot; no necesita replay durable.

**Rationale**: Cumple FR-052 y FR-SSE-1–8 sin convertir el transporte en fuente
de verdad. El snapshot inicial cubre el intervalo entre el `202` y la suscripción,
además de reload/reopen, con menos infraestructura que un log de eventos.

**Alternatives considered**: POST bloqueante, polling, long polling, WebSockets,
streaming token por token y cola/bus externo. Todos quedan fuera de v1. Si SSE
falla, la UI muestra un error y solo puede restablecer SSE; no existe fallback.

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

**Decision**: PostgreSQL calcula `hasWorkInProgress` y el backend lo publica como
`busy_update` propio después de cada commit relevante. La UI aplica ese evento a
la conversación correspondiente: true deshabilita Enviar, Retry y Delete; false
reactiva acciones elegibles aunque el turno sea `failed` o `partial`.

**Rationale**: Evita dobles emisores de trabajo y mantiene la regla por
conversación, no por aplicación.

**Interaction with first failure**: `slot_update` muestra Retry y Continue-without
al primer fallo recuperable. Si `busy_update` sigue true, Retry aparece disabled;
Continue-without permanece disponible porque no invoca providers. Navegación y
Rename siguen disponibles.

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
transiciona atómicamente `failed → pending` cuando el slot base es recuperable y
no tiene `continued_without_at`; si el mismo slot ya está `pending` o `running`,
responde `409 RESPONSE_RETRY_IN_PROGRESS`, y si no es elegible responde
`409 RESPONSE_NOT_RETRYABLE`.

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

## Decision 7: Continue-without es irreversible y no es trabajo en curso

**Decision**: Continue-without solo actualiza un slot base `failed`, persiste
`continued_without_at`, no cambia el slot a `pending`/`running` y lo excluye de
retry permanentemente para ese turno. Qwen omite ese slot en la consolidación
actual y en cualquier reconsolidación.

**Rationale**: Permite tomar la decisión inmediatamente, incluso mientras otros
slots del mismo turno siguen ejecutándose, sin violar el bloqueo de emisores de
trabajo.

**Alternatives considered**: Hacer reversible la decisión, invocar un provider o
crear otro turno desde esta acción. Contradicen FR-051 o añadirían trabajo.

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

## Decision 9: Contexto acotado con protección técnica y evidencia segura

**Decision**: `ContextBuilder` selecciona una ventana configurable de turnos
relevantes. Antes de cada adapter obtiene el límite técnico configurado del
deployment, estima el tamaño y compara contra
`LLM_CONTEXT_THRESHOLD_RATIO=0.8`. Si excede el umbral, elimina primero turnos
históricos antiguos y después recorta contenido contextual auxiliar preservando
roles, etiquetas y prompt actual. Si el payload mínimo no cabe, el slot falla con
`INVALID_PROMPT_SIZE` sin invocar al provider.

Cada adapter/deployment usa un contador exacto compatible cuando exista o una
cota superior conservadora demostrable para su tokenizer, versión y envelope.
La medición incluye contenido, roles y overhead del protocolo. No se acepta un
heurístico que pueda subestimar; un rechazo real por tamaño se normaliza con el
mismo código seguro.

Los contract tests cubren ASCII, puntuación densa, Unicode, emoji, scripts no
latinos y contenido fragmentado/con delimitadores. Cuando existe conteo real o
tokenizer de referencia, el modo exacto debe coincidir y la cota debe cumplir
`medición >= real`. Un deployment no se habilita con un medidor cuya garantía no
esté documentada y probada.

Persiste únicamente:

- `truncated`;
- primer ordinal incluido;
- último ordinal incluido;
- tipo de protección aplicada.

**Rationale**: Permite explicar la ventana sin copiar el prompt compuesto,
respuestas, cifras estimadas, límites ni contexto sensible. El umbral deja margen
para diferencias del tokenizer sin convertir la protección en presupuesto de
producto.

**Isolation**:

- cada base recibe solo su historial y prompt actual;
- Qwen recibe su historial consolidado, prompt actual y respuestas base actuales;
- Qwen nunca recibe historiales base.

**Alternatives considered**: Historial completo, copia del contexto compuesto,
resumen LLM adicional o presupuesto de producto por modelo. Respectivamente puede
exceder límites, duplica contenido sensible, añade otra llamada o introduce una
política no definida.

La estimación es efímera y técnica. No se persiste ni usa para facturación,
ranking o contabilidad por modelo. PostgreSQL conserva el historial completo.

## Decision 10: Recovery dedicado y reanudación mediante SSE nuevo

**Decision**: `server.ts` ejecuta `recoverInterruptedTurns()` antes de `listen()`;
`index.ts` solo llama start/stop. Recovery termina slots persistidos
`pending`/`running`, recalcula turnos y busy, y no relanza providers.

Al recargar o reabrir, frontend lee el estado persistido y abre una suscripción
SSE nueva si todavía hay trabajo. El snapshot inicial entrega lo ocurrido durante
la desconexión. Un error de stream es visible y nunca inicia otro transporte.

**Rationale**: El trabajo en memoria no sobrevive reinicios. La reconciliación
libera conversaciones atascadas y conserva resultados completados.

**Alternatives considered**: Recovery en `index.ts`, reanudación de providers,
replay de eventos o fallback de transporte; violan FR-037 o añaden ejecución
durable no especificada.

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

## Decision 13: Delete se excluye durante busy

**Decision**: `DELETE /conversations/:id` bloquea la conversación dentro de la
transacción, comprueba turnos y slots `pending`/`running` y devuelve
`409 CONVERSATION_BUSY` sin borrar si existe trabajo. Sin busy, usa el cascade
existente. Rename permanece permitido.

**Rationale**: Evita borrar el destino persistente de resultados en curso sin
introducir cancelación ni recuperación adicional.

**Alternatives considered**: Borrar y descartar resultados tardíos, cancelar
providers o bloquear Rename. No corresponden a FR-050.

## Decision 14: Dos módulos Liquibase

**Decision**: `conversations` crea conversaciones/turnos; `messages` crea slots e
índices. Los XML se incluyen desde el master.

**Rationale**: Son los límites persistentes reales. Constraints PostgreSQL
implementan idempotencia, ordinales, turno activo y slot único sin nuevas tablas.

## Decision 15: Evaluación y observabilidad mínimas

**Decision**: SC-005 usa un fixture versionado de máximo cinco casos y checks
simples, con umbral del 90%. Pino registra IDs técnicos, busy, replay, slot,
duración, conexión/cierre SSE, protección aplicada y estado sin contenido,
payloads de eventos ni cifras medidas. El contrato LLM reserva métricas reales
opcionales, pero v1 no las usa para contabilidad ni persiste tokens/costo.

**Rationale**: Hace aceptación y diagnóstico verificables sin ranking, dashboard
ni plataforma de trazas.

## Decision 16: SC-003 y SC-004 pertenecen a Product/UX

**Decision**: Product/UX entrega un protocolo versionado con tareas, escenarios,
criterios observables y métricas subjetivas para busy, retry/Continue-without,
contexto truncado, Delete bloqueado, historial y error SSE. Después ejecuta con
participantes y registra por separado para SC-003 y SC-004 el numerador,
denominador, porcentaje y `pass`/`fail` frente al 90%, además de observaciones y
propuestas.

**Rationale**: Los porcentajes de usabilidad no se sustituyen por E2E ni por la
mera realización de una sesión; requieren evidencia cuantificable con
participantes y owner explícito.

**Alternatives considered**: Inferir usabilidad desde tests automatizados o
incorporar ajustes futuros automáticamente a v1. Ninguna satisface SC-003/SC-004.

## Acceptance Scope

- SC-002 se valida en el 100% de los casos del conjunto de prueba de recovery al
  recrear app/servicios sobre la misma DB. No es una afirmación global.
- SC-010 exige `202` y menos de un segundo para create y primera página de
  historial en al menos el 95% de ejecuciones del conjunto local controlado con
  providers fake. No se endurece a 100%.

## Resolved Unknowns

Concurrencia, busy UI, idempotencia, retry, primera falla, protección técnica de
contexto, Delete busy, Continue-without irreversible, REST + SSE, reconexión sin
fallback y aceptación Product/UX están cerrados según el spec.
