# Feature Specification: Catálogo configurable de deployments por conversación

**Feature Branch**: `002-configurable-provider-deployments`  
**Created**: 2026-08-19  
**Status**: Draft  
**Input**: Fuente normativa: `specs/002-configurable-provider-deployments/requirements-brief.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Elegir deployments al crear una conversación (Priority: P1)

Como usuario, quiero asignar un deployment disponible a cada uno de los cuatro slots lógicos al crear una conversación, para combinar proveedores directos y OpenRouter sin cambiar la semántica de la conversación.

**Why this priority**: La selección por conversación es el valor principal de la feature y desacopla los slots lógicos de proveedores y modelos concretos.

**Independent Test**: Con un catálogo disponible, se crea una conversación eligiendo cuatro `deploymentId` distintos, se comprueba la asignación devuelta para cada slot y se inicia un turno con esa selección.

**Acceptance Scenarios**:

1. **Given** diez deployments disponibles, **When** el usuario asigna cuatro `deploymentId` distintos a `base-1`, `base-2`, `base-3` y `consolidator`, **Then** la conversación se crea con exactamente esas cuatro asignaciones.
2. **Given** deployments de API directa y de OpenRouter disponibles, **When** el usuario los combina en los cuatro slots, **Then** cada slot puede usar cualquier entrada disponible sin restricciones por provider.
3. **Given** una selección válida, **When** se completa la creación, **Then** la respuesta y el detalle de la conversación muestran por slot el `deploymentId`, `providerId`, `modelId` y `displayName` persistidos.
4. **Given** el formulario de nueva conversación, **When** se muestran los selectores, **Then** cada selector presenta `displayName` y `providerId` y solo incluye entradas devueltas por el catálogo.

---

### User Story 2 - Crear con el perfil por defecto (Priority: P1)

Como usuario, quiero crear una conversación sin seleccionar deployments manualmente, para comenzar con un perfil predeterminado completo cuando sus credenciales estén configuradas.

**Why this priority**: Conserva el flujo de creación simple y garantiza una configuración inicial determinista.

**Independent Test**: Con las credenciales de OpenAI, Google y OpenRouter configuradas, se omite `deploymentIds` y se verifica la asignación exacta de los cuatro slots; después se repite sin una credencial requerida y se verifica el rechazo seguro.

**Acceptance Scenarios**:

1. **Given** `OPENAI_API_KEY`, `GOOGLE_API_KEY` y `OPENROUTER_API_KEY` configuradas, **When** el usuario crea una conversación sin `deploymentIds`, **Then** se asignan `openai-5.6-sol` a `base-1`, `gemini-3.7-flash` a `base-2`, `openrouter-minimax-m3` a `base-3` y `openrouter-qwen-3.8-max` a `consolidator`.
2. **Given** que falta al menos una credencial requerida por el perfil por defecto, **When** se crea una conversación sin `deploymentIds`, **Then** la creación se rechaza con `503 DEFAULT_PROFILE_UNAVAILABLE` y el cuerpo contiene únicamente un mensaje seguro y los `deploymentId` faltantes.
3. **Given** que el perfil por defecto está disponible, **When** se abre la pantalla de nueva conversación, **Then** los cuatro selectores aparecen preseleccionados con ese perfil.

---

### User Story 3 - Consultar solo deployments disponibles (Priority: P1)

Como usuario, quiero ver únicamente deployments que la instalación puede ejecutar, para no elegir modelos sin la credencial requerida.

**Why this priority**: Evita selecciones inviables sin obligar a configurar credenciales para providers que la instalación no usa.

**Independent Test**: Se consulta el catálogo con distintas combinaciones de credenciales y se comprueba que solo aparecen los deployments disponibles, ordenados y sin información sensible.

**Acceptance Scenarios**:

1. **Given** las credenciales de OpenAI, Google y OpenRouter configuradas, **When** se consulta `GET /api/v1/model-catalog`, **Then** se devuelven exactamente los diez deployments iniciales disponibles ordenados por `displayName`.
2. **Given** que falta la credencial de un provider, **When** se consulta el catálogo, **Then** se omiten todos sus deployments y no se devuelve una entrada marcada como no disponible ni una razón interna.
3. **Given** un `deploymentId` cuya credencial no está configurada, **When** se solicita directamente al crear una conversación, **Then** la creación se rechaza con `422 DEPLOYMENT_UNAVAILABLE`.
4. **Given** una instalación sin alguna credencial opcional, **When** el backend arranca, **Then** la ausencia de esa credencial no impide el arranque.

---

### User Story 4 - Conservar la asignación durante toda la conversación (Priority: P1)

Como usuario, quiero que una conversación conserve los deployments con los que fue creada, para que los cambios posteriores del catálogo o de la configuración no alteren sus respuestas.

**Why this priority**: La reproducibilidad y la semántica de los turnos dependen de una asignación estable.

**Independent Test**: Se crea una conversación, se cambia el catálogo o la configuración del proceso y se comprueba que los turnos posteriores siguen utilizando los datos persistidos por slot.

**Acceptance Scenarios**:

1. **Given** una selección válida, **When** se crea la conversación, **Then** sus cuatro deployments se persisten atómicamente antes de iniciar cualquier llamada externa.
2. **Given** una conversación ya creada, **When** cambia el catálogo o la configuración del proceso, **Then** sus turnos posteriores reutilizan la instantánea persistida sin volver a resolver el catálogo mutable.
3. **Given** una conversación existente, **When** el usuario consulta su detalle, **Then** la asignación se muestra como solo lectura y no existe un control para reemplazar deployments.
4. **Given** una conversación creada, **When** se usa cualquier operación de turno, retry, recovery, rename o eliminación, **Then** la operación no acepta cambios de `deploymentIds`.

---

### User Story 5 - Impedir deployments duplicados (Priority: P1)

Como usuario, quiero recibir una validación clara si repito el mismo deployment en dos slots, para corregir la selección antes de iniciar la conversación.

**Why this priority**: La unicidad por conversación es una regla de integridad obligatoria y debe evitar efectos parciales o llamadas externas.

**Independent Test**: Se intenta crear una conversación con un `deploymentId` repetido, primero desde la UI y después directamente contra el backend, y se verifica que no se creen filas ni se invoquen providers.

**Acceptance Scenarios**:

1. **Given** el mismo `deploymentId` seleccionado en dos slots, **When** el usuario intenta enviar el formulario, **Then** la UI bloquea el envío y muestra el error de validación.
2. **Given** una petición con un `deploymentId` repetido, **When** el backend valida la creación, **Then** responde `422 DUPLICATE_DEPLOYMENT_ASSIGNMENT`, no crea filas y no inicia llamadas externas.
3. **Given** dos deployments distintos del mismo provider, **When** se asignan a slots distintos, **Then** la selección es válida.
4. **Given** dos deployments con distinto `deploymentId` que representan el mismo modelo subyacente por rutas diferentes, **When** se asignan a slots distintos, **Then** la selección es válida.

---

### User Story 6 - Ejecutar deployments mediante adapters normalizados (Priority: P2)

Como operador de la aplicación, quiero que cada deployment se ejecute mediante el adapter de su `providerId`, para incorporar OpenRouter y futuros providers sin cambiar slots ni orquestación.

**Why this priority**: Habilita la mezcla de proveedores manteniendo un único contrato normalizado y límites claros entre adapters.

**Independent Test**: Se ejecutan contract tests equivalentes para OpenRouter y los adapters existentes, verificando contenido, métricas, cancelación, timeout, número de llamadas y normalización de errores.

**Acceptance Scenarios**:

1. **Given** un deployment de OpenRouter resuelto para un slot, **When** se ejecuta un intento, **Then** se realiza una sola llamada a `POST https://openrouter.ai/api/v1/chat/completions`, con autenticación Bearer basada en `OPENROUTER_API_KEY` y el `modelId` exacto del catálogo.
2. **Given** una respuesta de OpenRouter con métricas de tokens, **When** se normaliza, **Then** se producen `inputTokens`, `outputTokens` y `totalTokens` con la misma semántica que los providers existentes.
3. **Given** una cancelación, timeout o error de OpenRouter, **When** se procesa el resultado, **Then** se conserva el contrato normalizado sin fallback ni reintento automático.
4. **Given** un adapter directo, **When** ejecuta su deployment, **Then** conserva su protocolo propio y no comparte el payload externo de otro provider.
5. **Given** cualquier deployment resuelto, **When** el adapter construye el intento, **Then** envía el `maxOutputTokens` exacto mediante el parámetro nativo del provider; OpenRouter usa `max_tokens`.

---

### User Story 7 - Aplicar límites de contexto y errores seguros (Priority: P2)

Como usuario, quiero que cada turno respete el límite del deployment seleccionado y que los fallos se comuniquen de forma segura, para evitar llamadas inválidas y exposición de información sensible.

**Why this priority**: Protege la ejecución con límites exactos y preserva las garantías de seguridad del sistema.

**Independent Test**: Se prueban los límites exactos del catálogo y la matriz de errores de OpenRouter, verificando que los payloads mínimos fuera de umbral no llamen al provider y que ninguna salida exponga datos sensibles o económicos.

**Acceptance Scenarios**:

1. **Given** un payload mínimo que excede el umbral calculado con `contextLimitTokens`, el ratio técnico existente y el medidor exigido, **When** se prepara el turno, **Then** se rechaza antes de llamar al provider.
2. **Given** una respuesta 401, 429, 408, 502, 503, 403 o 402 de OpenRouter, **When** se normaliza el error, **Then** se aplica exactamente la categoría definida para ese caso y el mensaje no expone información sensible.
3. **Given** cualquier ejecución de OpenRouter, **When** se inspeccionan datos persistidos y registros, **Then** no existen precios, costos, moneda, billing, créditos, presupuesto ni consumo económico.

### Edge Cases

- `deploymentIds` está presente pero omite uno de los cuatro slots, incluye una clave adicional, contiene un valor vacío o contiene `null`: la creación se rechaza sin filas ni llamadas externas.
- Un `deploymentId` existe en el catálogo estático pero su credencial requerida no está configurada: no aparece en el catálogo disponible y una selección directa recibe `422 DEPLOYMENT_UNAVAILABLE`.
- Falta cualquiera de las credenciales requeridas por los cuatro deployments por defecto: la creación sin selección recibe `503 DEFAULT_PROFILE_UNAVAILABLE` con solo un mensaje seguro y los identificadores faltantes.
- El mismo `deploymentId` aparece en más de un slot: se aplica la unicidad al identificador completo, aunque los slots sean diferentes.
- Dos deployments diferentes pertenecen al mismo provider o apuntan al mismo modelo por rutas distintas: la selección sigue siendo válida mientras sus `deploymentId` sean distintos.
- El catálogo o la configuración del proceso cambia después de crear una conversación: la conversación y sus turnos conservan la instantánea original.
- Un error de OpenRouter contiene `error.metadata.error_type` igual a `content_policy_violation` o `refusal`, o un 403 contiene `error.metadata.reasons` o `error.metadata.patterns` como arrays no vacíos: se normaliza como `content_blocked`; cualquier otro 403 se normaliza como `provider_error`, sin inspeccionar texto libre.
- OpenRouter devuelve 402: se normaliza como `provider_error` con mensaje seguro y sin modelar ni exponer créditos.
- El upstream no informa métricas de tokens: solo se normalizan `inputTokens`, `outputTokens` y `totalTokens` cuando están disponibles.
- El payload mínimo ya excede el umbral de contexto del deployment: se detiene la ejecución antes de cualquier llamada externa.
- Un provider rechaza el `maxOutputTokens` configurado: el intento termina como `provider_error`, sin reducción, negociación ni retry automático.
- Una petición, evento SSE o fila intenta usar `openai`, `google`, `minimax` o `qwen` como slot: se rechaza porque solo `base-1`, `base-2`, `base-3` y `consolidator` pertenecen al contrato nuevo.

## Requirements *(mandatory)*

### Functional Requirements

#### Slots, selección y creación

- **FR-001**: Cada conversación MUST conservar exactamente cuatro slots lógicos: `base-1`, `base-2`, `base-3` y `consolidator`. Estos identificadores reemplazan por completo a `openai`, `google`, `minimax` y `qwen`, que MUST ser inválidos en API, persistencia, SSE y UI sin aliases ni traducción de compatibilidad.
- **FR-002**: El usuario MUST poder asignar cualquier deployment disponible a cualquiera de los cuatro slots únicamente durante la creación de una conversación.
- **FR-003**: El endpoint existente de creación MUST aceptar el campo opcional `deploymentIds` como objeto cuyas claves exactas sean `base-1`, `base-2`, `base-3` y `consolidator`, cada una asociada con un `deploymentId`.
- **FR-004**: Cuando `deploymentIds` esté presente, el sistema MUST exigir las cuatro claves, MUST rechazar claves adicionales y MUST rechazar valores vacíos o `null`.
- **FR-005**: Cuando `deploymentIds` esté ausente, el sistema MUST aplicar exactamente este perfil: `base-1` = `openai-5.6-sol`, `base-2` = `gemini-3.7-flash`, `base-3` = `openrouter-minimax-m3`, `consolidator` = `openrouter-qwen-3.8-max`.
- **FR-006**: El perfil por defecto MUST aplicarse solo cuando estén configuradas las credenciales requeridas por sus cuatro deployments.
- **FR-007**: Si falta una credencial requerida por el perfil por defecto, la creación sin `deploymentIds` MUST responder `503 DEFAULT_PROFILE_UNAVAILABLE`; el cuerpo MUST contener únicamente un mensaje seguro y los `deploymentId` faltantes.
- **FR-008**: Una conversación MUST rechazar la repetición del mismo `deploymentId` en dos o más slots, tanto en frontend como en backend.
- **FR-009**: El backend MUST reforzar la unicidad dentro de la transacción de creación y, ante una repetición, MUST responder `422 DUPLICATE_DEPLOYMENT_ASSIGNMENT` sin crear filas ni iniciar llamadas externas.
- **FR-010**: La unicidad MUST evaluarse por `deploymentId` completo; deployments distintos del mismo provider o del mismo modelo subyacente MUST poder coexistir en una conversación.

#### Catálogo y disponibilidad

- **FR-011**: El catálogo MUST ser estático en el backend y MUST NOT consultarse ni actualizarse desde un endpoint externo durante el arranque o una conversación.
- **FR-012**: Cada deployment MUST contener un `deploymentId` público, estable y único; `displayName`; `providerId`; `modelId`; `contextLimitTokens`; `maxOutputTokens`; `inputModalities`; `outputModalities`; y la credencial requerida para determinar disponibilidad.
- **FR-013**: El catálogo MUST NOT contener claves, endpoints secretos, prompts ni precios.
- **FR-014**: El catálogo inicial MUST contener exactamente estas definiciones:

| deploymentId | displayName | providerId | modelId enviado al provider | contextLimitTokens | maxOutputTokens |
|---|---|---|---|---:|---:|
| `openrouter-minimax-m3` | MiniMax M3 | `openrouter` | `minimax/minimax-m3` | 524288 | 512000 |
| `openrouter-minimax-m2.7` | MiniMax M2.7 | `openrouter` | `minimax/minimax-m2.7` | 204800 | 204800 |
| `openrouter-qwen-3.8-max` | Qwen 3.8 Max | `openrouter` | `qwen/qwen3.8-max` | 1000000 | 131072 |
| `openrouter-kimi-k3` | Kimi K3 | `openrouter` | `moonshotai/kimi-k3` | 1048576 | 1048576 |
| `openrouter-glm-5.2` | GLM 5.2 | `openrouter` | `z-ai/glm-5.2` | 1048576 | 1048576 |
| `openrouter-deepseek-v4-flash-0731` | DeepSeek V4 Flash 0731 | `openrouter` | `deepseek/deepseek-v4-flash-0731` | 1048576 | 393216 |
| `gemini-3.7-flash` | Gemini 3.7 Flash | `google` | `gemini-3.7-flash` | 1048576 | 65536 |
| `openai-5.6-sol` | GPT-5.6 Sol | `openai` | `gpt-5.6-sol` | 1050000 | 128000 |
| `openai-5.6-terra` | GPT-5.6 Terra | `openai` | `gpt-5.6-terra` | 1050000 | 128000 |
| `openai-5.6-luna` | GPT-5.6 Luna | `openai` | `gpt-5.6-luna` | 1050000 | 128000 |

Los `maxOutputTokens` de esta tabla son valores operativos iniciales normativos,
incluidos los aprobados para MiniMax M2.7, Kimi K3 y GLM 5.2. No son límites de
entrada ni autorizan ajuste dinámico.

Las capacidades iniciales exactas son:

| deploymentId | inputModalities | outputModalities |
|---|---|---|
| `openrouter-minimax-m3` | `text`, `image`, `video` | `text` |
| `openrouter-minimax-m2.7` | `text` | `text` |
| `openrouter-qwen-3.8-max` | `text`, `image`, `video` | `text` |
| `openrouter-kimi-k3` | `text`, `image`, `video` | `text` |
| `openrouter-glm-5.2` | `text` | `text` |
| `openrouter-deepseek-v4-flash-0731` | `text` | `text` |
| `gemini-3.7-flash` | `text`, `image`, `video`, `audio`, `pdf` | `text` |
| `openai-5.6-sol` | `text`, `image` | `text` |
| `openai-5.6-terra` | `text`, `image` | `text` |
| `openai-5.6-luna` | `text`, `image` | `text` |

- **FR-015**: Para deployments de OpenRouter, `contextLimitTokens` MUST representar `top_provider.context_length`, la cota efectiva de la ruta seleccionada.
- **FR-016**: El catálogo inicial MUST NOT incluir variantes `:batch`, `:free`, aliases `latest` ni modelos distintos de los diez definidos; GLM MUST usar `z-ai/glm-5.2` y DeepSeek MUST usar `deepseek/deepseek-v4-flash-0731`.
- **FR-017**: Los adapters soportados por la arquitectura MUST ser `openai`, `google`, `minimax`, `qwen` y `openrouter`; MiniMax y Qwen directos MUST permanecer disponibles como extensiones del registro, sin deployments iniciales en el catálogo.
- **FR-018**: Cada adapter MUST declarar exactamente su credencial requerida: `openai` = `OPENAI_API_KEY`, `google` = `GOOGLE_API_KEY`, `minimax` = `MINIMAX_API_KEY`, `qwen` = `QWEN_API_KEY`, `openrouter` = `OPENROUTER_API_KEY`.
- **FR-019**: Las credenciales MUST ser opcionales a nivel de instalación y la ausencia de una credencial opcional MUST NOT impedir el arranque del backend.
- **FR-020**: `GET /api/v1/model-catalog` MUST devolver únicamente deployments cuya credencial requerida esté configurada, ordenados por `displayName`.
- **FR-021**: La respuesta del catálogo MUST NOT incluir entradas no disponibles, razones internas de disponibilidad, secretos, precios, créditos ni información de billing.
- **FR-022**: Si una creación solicita un `deploymentId` no disponible, el backend MUST responder `422 DEPLOYMENT_UNAVAILABLE`.

#### Persistencia e inmutabilidad

- **FR-023**: La creación MUST persistir, dentro de una transacción y antes de iniciar cualquier provider, una fila por slot con `conversationId`, `slot`, `deploymentId`, `providerId`, `modelId`, `displayName`, `contextLimitTokens`, `maxOutputTokens`, `inputModalities`, `outputModalities` y timestamps de creación y actualización.
- **FR-024**: La instantánea MUST tener clave primaria `(conversationId, slot)` y restricción única `(conversationId, deploymentId)`.
- **FR-025**: Las cuatro filas de la instantánea MUST ser inmutables después de crear la conversación.
- **FR-026**: Los turnos posteriores MUST reutilizar la instantánea persistida y MUST NOT volver a resolver el catálogo mutable ni una variable de entorno de modelo por nombre de slot.
- **FR-027**: Las respuestas de creación y detalle MUST incluir por slot `deploymentId`, `providerId`, `modelId` y `displayName` provenientes de la instantánea.
- **FR-028**: Ningún endpoint de turnos, retry, recovery, rename o eliminación MUST aceptar cambios de `deploymentIds`.
- **FR-029**: La UI MUST mostrar la asignación de una conversación existente como solo lectura y MUST NOT ofrecer controles para reemplazar un deployment.
- **FR-030**: `model_responses` y `ContextBuilder` MUST consumir la instantánea persistida de la conversación.

#### UI de creación

- **FR-031**: La pantalla de nueva conversación MUST mostrar cuatro selectores, uno por slot, y cada selector MUST permitir cualquier entrada disponible.
- **FR-032**: Cada selector MUST mostrar `displayName` y `providerId` y MUST contener únicamente las entradas devueltas por el catálogo.
- **FR-033**: Cuando el perfil por defecto esté disponible, los cuatro selectores MUST aparecer preseleccionados con sus asignaciones exactas.
- **FR-034**: La UI MUST detectar deployments duplicados, bloquear el envío y mostrar el error de validación antes de enviar la creación.

#### Adapters y ejecución

- **FR-035**: La orquestación MUST conocer únicamente el contrato normalizado `LlmProvider`; MUST NOT ramificar por nombre de provider ni construir payloads externos.
- **FR-036**: El registro de adapters MUST estar indexado por `providerId` y el orquestador MUST recibir un deployment resuelto por slot.
- **FR-037**: Agregar un provider futuro MUST requerir solamente implementar el contrato del adapter, declarar su credencial y registrar sus deployments; MUST NOT requerir un slot nuevo ni cambios al orquestador.
- **FR-038**: OpenRouter MUST usar `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer $OPENROUTER_API_KEY` y el `modelId` exacto del catálogo.
- **FR-039**: OpenRouter MUST conservar el contrato normalizado de mensajes, cancelación y timeout, y MUST realizar una sola llamada externa por intento.
- **FR-040**: OpenRouter MUST NOT usar fallbacks automáticos, variantes `:free` ni reintentos automáticos.
- **FR-041**: Los adapters directos MUST conservar sus protocolos propios y ningún adapter MUST compartir payloads externos con otro provider por compatibilidad de formato.
- **FR-042**: OpenRouter MUST normalizar `inputTokens`, `outputTokens` y `totalTokens` con la misma semántica de los providers existentes cuando el upstream informe esas métricas.

#### Contexto, métricas y errores

- **FR-043**: La protección de contexto MUST usar el `contextLimitTokens` de la instantánea del deployment, el ratio técnico existente y el medidor exacto o cota superior exigidos por el contrato.
- **FR-044**: Si el payload mínimo excede el umbral de contexto, el sistema MUST rechazarlo antes de llamar al provider.
- **FR-045**: El sistema MUST NOT persistir prompts compuestos ni conteos de tokens.
- **FR-046**: El sistema MUST NOT añadir, registrar ni persistir métricas de precio, costo, moneda, billing, créditos, presupuesto o consumo económico para OpenRouter.
- **FR-047**: Los errores HTTP de OpenRouter MUST normalizarse así: 401 = `authentication`; 429 = `rate_limited`; 408, 502 y 503 = `provider_transient_error`; 402 = `provider_error` con mensaje seguro y sin exponer ni modelar créditos. Un error MUST ser `content_blocked` únicamente cuando `error.metadata.error_type` sea `content_policy_violation` o `refusal`, o cuando un 403 contenga `error.metadata.reasons` o `error.metadata.patterns` como arrays no vacíos. Cualquier otro 403 MUST ser `provider_error`. La clasificación MUST NOT inspeccionar texto libre y MUST descartar toda metadata upstream después de clasificarla.
- **FR-048**: Ningún error MUST exponer headers o bodies upstream, stacks, claves o prompts.

#### Límite de alcance

- **FR-049**: Esta feature MUST validarse sobre una base limpia y MUST NOT incluir backfill ni conversión de conversaciones de producción. MUST incluir la migración de esquema necesaria para persistir las instantáneas y reemplazar los constraints de slot por `base-1`, `base-2`, `base-3` y `consolidator`.

#### Reglas operativas complementarias

- **FR-050**: Cada adapter MUST enviar el `maxOutputTokens` exacto del deployment mediante el parámetro nativo equivalente; OpenRouter MUST usar `max_tokens`. El valor MUST NOT participar en el cálculo del límite de entrada ni provocar truncamiento local de la respuesta.
- **FR-051**: Si el provider rechaza `maxOutputTokens`, el adapter MUST normalizar el intento como `provider_error` y MUST NOT reducir, negociar, descubrir, reintentar ni sustituir automáticamente el valor.
- **FR-052**: `GET /api/v1/model-catalog` MUST exponer las `inputModalities` y `outputModalities` exactas de la tabla normativa. Esta feature MUST conservar entradas de usuario exclusivamente de texto y MUST NOT añadir carga de imagen, audio, video o PDF.

### Key Entities

- **Deployment**: Configuración estática e identificable disponible para asignación. Contiene el identificador público estable, datos visibles, adapter y modelo exactos, límite de entrada, límite operativo de salida, modalidades exactas y la credencial que determina disponibilidad; no contiene secretos, prompts, endpoints secretos ni precios.
- **Provider adapter**: Encapsula el protocolo externo y la credencial de un provider bajo el contrato normalizado `LlmProvider`. Se identifica por `providerId`.
- **Catálogo de deployments**: Conjunto estático de los diez deployments iniciales. La vista disponible se obtiene filtrando por credenciales configuradas y ordenando por `displayName`.
- **Asignación de deployments de conversación**: Objeto de creación que relaciona exactamente los cuatro slots lógicos con cuatro `deploymentId` distintos.
- **Instantánea de deployment por slot**: Registro inmutable asociado a una conversación y un slot, con los datos necesarios para ejecutar todos sus turnos sin volver a consultar el catálogo mutable.
- **Conversación**: Agregado que posee exactamente cuatro instantáneas, una por slot, y conserva esa asignación durante toda su vida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con `OPENAI_API_KEY`, `GOOGLE_API_KEY` y `OPENROUTER_API_KEY` configuradas, el catálogo devuelve exactamente 10 deployments disponibles y sus identificadores, nombres, providers, modelos y límites coinciden al 100% con la tabla normativa.
- **SC-002**: El 100% de las creaciones sin selección y con las credenciales requeridas persiste las cuatro asignaciones exactas del perfil por defecto antes de iniciar llamadas externas.
- **SC-003**: Los usuarios pueden asignar cualquiera de los deployments disponibles a cualquiera de los cuatro slots, con una tasa de aceptación del 100% para combinaciones de cuatro `deploymentId` distintos.
- **SC-004**: El 100% de las selecciones con un `deploymentId` duplicado se rechaza atómicamente con `422 DUPLICATE_DEPLOYMENT_ASSIGNMENT`, sin filas creadas ni llamadas a providers.
- **SC-005**: El 100% de los turnos posteriores usa la instantánea original de la conversación aunque cambien el catálogo o la configuración del proceso.
- **SC-006**: Ninguna operación de UI o API permite reemplazar un deployment después de crear la conversación.
- **SC-007**: El 100% de los deployments sin credencial queda fuera del catálogo, y toda selección directa de uno de ellos se rechaza con `422 DEPLOYMENT_UNAVAILABLE`.
- **SC-008**: OpenRouter supera los mismos contract tests aplicables a los adapters existentes para contenido, métricas, cancelación, timeout y errores, manteniendo una sola llamada externa por intento.
- **SC-009**: Ninguna prueba de registros o persistencia encuentra precios, créditos, billing, presupuesto, moneda, costos o consumo económico de OpenRouter.
- **SC-010**: Para cada uno de los 10 límites exactos del catálogo, un payload mínimo sobre el umbral se rechaza antes de llamar al provider.
- **SC-011**: El 100% de las respuestas de creación y detalle presenta por slot los cuatro datos visibles persistidos: `deploymentId`, `providerId`, `modelId` y `displayName`.
- **SC-012**: El 100% de los contract tests de deployments verifica que cada intento envía el `maxOutputTokens` exacto y que su rechazo no genera ajuste ni retry automático.
- **SC-013**: El catálogo devuelve al 100% las modalidades exactas de la tabla normativa y ningún flujo de esta feature permite adjuntar contenido distinto de texto.
- **SC-014**: El 100% de las validaciones de API, persistencia, SSE y UI acepta únicamente `base-1`, `base-2`, `base-3` y `consolidator` como slots.
- **SC-015**: La migración de esquema se aplica correctamente sobre una base limpia y no ejecuta backfill ni conversión de conversaciones.

## Assumptions

- El entorno actual todavía no contiene conversaciones de usuario; la validación de esta feature se realiza sobre una base limpia y no requiere migración de conversaciones de producción.
- Las credenciales de provider se configuran por instalación y son opcionales; la disponibilidad observable deriva exclusivamente de si está configurada la credencial declarada por cada adapter.
- La semántica de cuatro slots, la semántica de conversación, el ratio técnico de contexto, el medidor exacto o cota superior y la matriz normalizada de providers ya existentes se conservan. Los identificadores anteriores de slot se reemplazan por los cuatro identificadores lógicos definidos en esta especificación.
- El catálogo inicial es la tabla cerrada de diez deployments de esta especificación; MiniMax y Qwen directos se conservan solo como extensiones del registro, sin entradas iniciales.
- Los valores iniciales de `maxOutputTokens` son normativos para esta versión y solo se cambian mediante una modificación explícita del catálogo después de obtener evidencia de rechazo del provider.
