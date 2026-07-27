# Phase 0 Research: ModelFuse

## Decision 1: Monolito modular en el monorepo actual

**Decision**: Mantener `apps/frontend`, `apps/backend`, `packages/ui` y `db` como
límites principales.

**Rationale**: ModelFuse es una aplicación privada para un usuario y comparte un
ciclo de despliegue. La separación existente ya asigna presentación, API,
orquestación, UI reutilizable y esquema sin necesitar servicios independientes.

**Alternatives considered**: Microservicios por proveedor y un workspace nuevo
para contratos. Ambos añaden coordinación sin un consumidor o escala adicional.

## Decision 2: REST asíncrono con polling

**Decision**: Crear y persistir el turno antes de responder `202`; el frontend
consulta el recurso del turno cada segundo hasta alcanzar un estado terminal.

**Rationale**: No se requiere streaming. Polling permite representar cuatro
estados independientes y reutiliza Express, Axios y TanStack Query.

**Alternatives considered**: SSE, WebSockets y colas externas. Se descartan en v1
porque el spec no exige streaming, multiinstancia ni ejecución durable fuera del
proceso Node.

## Decision 3: Cuatro adapters reales y un contrato interno normalizado

**Decision**: Implementar adapters separados para OpenAI, Google, MiniMax y Qwen.
Todos usan Axios, pero cada adapter construye y interpreta el protocolo propio de
su proveedor. `TurnOrchestrator` solo recibe `LlmProvider` y `LlmResult`.

**Rationale**: El spec prohíbe asumir un protocolo común. Axios ya está instalado,
por lo que añadir cuatro SDKs no aporta valor al contrato interno.

**Provider paths**:

- OpenAI: Responses API con mensajes explícitos y sin depender de estado remoto.
- Google: `generateContent` stateless con el historial permitido enviado en cada
  llamada.
- MiniMax: endpoint nativo `POST /v1/text/chatcompletion_v2`.
- Qwen: interfaz nativa DashScope de Alibaba Cloud Model Studio.

**Alternatives considered**: Un adapter OpenAI-compatible compartido, descartado
por contradecir FR-036; SDKs oficiales por proveedor, diferidos mientras Axios
cubra los cuatro contratos con menos dependencias.

**Sources**:

- [OpenAI text generation and Responses API](https://developers.openai.com/api/docs/guides/text)
- [Google Gemini `generateContent`](https://ai.google.dev/api/generate-content)
- [MiniMax text generation API](https://platform.minimax.io/docs/api-reference/text-post)
- [Qwen native text generation on Model Studio](https://www.alibabacloud.com/help/en/model-studio/text-generation)

## Decision 4: Contexto reconstruido desde PostgreSQL y acotado por turnos

**Decision**: `ContextBuilder` selecciona una cantidad configurable de turnos
recientes y registra qué ordinales incluyó y si truncó historial. No define
presupuestos de tokens, límites de salida ni estimaciones por modelo.

**Rationale**: Cumple la ventana explícita exigida por la constitución sin añadir
una política que el spec descartó. PostgreSQL conserva el historial completo y
explica qué parte se envió.

**Composition**:

- OpenAI, Google y MiniMax reciben el nuevo mensaje y solo sus propios pares
  históricos usuario/respuesta.
- Qwen recibe su historial consolidado, el nuevo mensaje y las respuestas base
  disponibles del turno actual.
- Qwen nunca recibe respuestas históricas de los modelos base.

**Alternatives considered**: Historial completo, descartado porque puede exceder
los límites externos; resumen automático y presupuesto por tokens, descartados
porque no son requisitos de esta versión.

## Decision 5: Retry y “continuar sin respuesta” se modelan por slot

**Decision**: Una respuesta base fallida puede reintentarse o marcarse como
“continuar sin respuesta”. La marca se persiste en la misma fila del slot.

**Rationale**: Mantiene una sola unidad de retry y evita duplicar turnos.

**Retry rules**:

1. Un retry base fallido no modifica ni relanza Qwen.
2. Un retry base exitoso marca la consolidación existente como obsoleta y ejecuta
   Qwen otra vez.
3. La nueva consolidación reemplaza el contenido anterior al completar.
4. Mientras se actualiza o si la actualización falla, el contenido anterior puede
   conservarse marcado como obsoleto.
5. Un retry directo de Qwen no ejecuta modelos base.

**Alternatives considered**: Retry del turno completo, descartado por FR-040;
tabla de versiones de respuesta, descartada porque `is_stale` y el contenido
existente cubren la única revisión requerida.

## Decision 6: Recovery dedicado fuera de `index.ts`

**Decision**: `server.ts` compone dependencias, ejecuta
`recoverInterruptedTurns()`, inicia Express y gestiona shutdown. `index.ts` solo
invoca start/stop.

**Rationale**: Cumple la constitución y mantiene recovery testeable sin abrir un
puerto.

**Recovery algorithm**:

1. Marcar slots `pending` o `running` como `failed/interrupted`.
2. Recalcular cada turno afectado.
3. Si conserva algún contenido útil, el turno queda `partial`; si no, `failed`.
4. La conversación y sus respuestas siguen consultables y los slots fallidos
   siguen siendo reintentables.

**Alternatives considered**: Recovery en `index.ts`, prohibido; reanudar llamadas
externas automáticamente, descartado porque no existe cola durable.

## Decision 7: Dos cursores y dos direcciones de scroll

**Decision**:

- Sidebar: cursor `(updated_at,id)`, páginas de tamaño fijo configurado en backend
  y `fetchNextPage()` al llegar al sentinel inferior.
- Chat: cursor `(ordinal,id)`, páginas fijas de tres turnos completos y
  `fetchPreviousPage()` al llegar al sentinel superior.

**Rationale**: Los cursores permanecen estables ante nuevas inserciones y las dos
listas cumplen experiencias distintas sin controles de página.

`useInfiniteQuery` v5 requiere `initialPageParam` y funciones explícitas para
obtener la página siguiente o anterior.

**Source**: [TanStack Query v5 infinite-query behavior](https://tanstack.com/query/v5/docs/framework/react/guides/migrating-to-v5).

## Decision 8: El sentinel inferior también llena el sidebar inicialmente

**Decision**: El mismo `IntersectionObserver` que carga páginas al descender sigue
visible mientras el contenido no llena el contenedor, provocando cargas
adicionales hasta llenarlo o hasta que `nextCursor` sea nulo.

**Rationale**: Cumple FR-043 sin un bucle adicional, cálculos manuales ni botones.

## Decision 9: Colapso histórico es estado visual local

**Decision**: `CollapsibleHistoryMessage` recibe `isHistorical` y el umbral
`VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD`. Solo los turnos recuperados desde páginas
de historial se colapsan; expandir no modifica cache ni servidor.

**Rationale**: La procedencia del mensaje es una preocupación de presentación, no
un campo persistente.

**Alternatives considered**: Truncar contenido en la API o persistir estado
expandido, descartados por FR-039.

## Decision 10: Título inicial determinista en backend

**Decision**: Al crear conversación, backend aplica
`prompt.trim().slice(0, 80)` y persiste el resultado en la misma transacción que
el primer turno.

**Rationale**: Una única implementación impide diferencias entre frontend y
persistencia. React escapa texto y PostgreSQL usa queries parametrizadas; rename
no necesita bloquear caracteres especiales.

## Decision 11: Fixture de consolidación pequeño, no framework de ranking

**Decision**: Un fixture JSON versionado contiene como máximo cinco casos. Cada
caso declara prompt, tres respuestas base y checks simples de inclusión o
no-repetición. Una suite de aceptación invoca Qwen de forma explícita y calcula el
porcentaje de checks aprobados.

**Rationale**: Hace SC-005 verificable automáticamente sin crear scoring,
dashboard ni evaluación general. La suite no forma parte del test unitario
predeterminado porque realiza llamadas reales.

## Decision 12: Liquibase SQL formateado con módulos existentes

**Decision**: `conversations` crea conversaciones y turnos; `messages` crea
respuestas y sus índices. Los XML de módulo se incluyen desde el master.

**Rationale**: Refleja ownership real y cumple la constitución. No se crea módulo
de métricas ni de evaluación.

**Source**: [Liquibase SQL changelogs](https://docs.liquibase.com/community/user-guide-5-0-2/sql-changelog-example).

## Decision 13: Observabilidad mínima y sin contenido

**Decision**: Pino registra request, conversación, turno, slot, proveedor/modelo,
duración, estado, recovery y tamaño de página. Nunca registra prompts,
respuestas, credenciales ni headers de autorización.

**Rationale**: Permite depurar latencia, polling, retries y recovery en un
monolito. OpenTelemetry se difiere hasta que exista distribución real.

## Resolved Unknowns

No quedan decisiones sin resolver. Las cuatro integraciones, los dos cursores,
recovery, retry y validación de SC-005 están definidos sin introducir políticas
de tokens ni protocolos compartidos.
