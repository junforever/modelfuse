# Requerimiento: catálogo de deployments y asignación por conversación

## Propósito

Desacoplar los slots lógicos de los proveedores y modelos concretos. El usuario
debe poder elegir, al crear una conversación, qué deployment usa cada slot y
debe poder combinar APIs directas con OpenRouter sin cambiar la orquestación ni
la semántica de la conversación.

Este documento es la fuente de entrada para `speckit specify` de la nueva
feature. Todas las decisiones de este documento son normativas.

## Alcance fijo

- La aplicación conserva cuatro slots lógicos por conversación:
  `base-1`, `base-2`, `base-3` y `consolidator`.
- Cualquier deployment disponible en el catálogo puede asignarse a cualquiera
  de los cuatro slots.
- La asignación se realiza únicamente al crear una conversación.
- La asignación de una conversación es inmutable: ningún endpoint ni control de
  la UI puede cambiar un slot después de creado el primer turno.
- Cada conversación persiste una instantánea de sus cuatro deployments. Los
  turnos posteriores siempre reutilizan esa instantánea y no vuelven a resolver
  el catálogo mutable.
- No hay migración de conversaciones de producción en el alcance de esta
  feature; el entorno actual aún no tiene conversaciones de usuario y la nueva
  implementación se valida sobre una base limpia.
- Los identificadores de slot anteriores `openai`, `google`, `minimax` y `qwen`
  dejan de formar parte del contrato. La API, persistencia, SSE y UI usan
  únicamente `base-1`, `base-2`, `base-3` y `consolidator`; no existe alias ni
  traducción de compatibilidad para los identificadores anteriores.
- La ausencia de migración de conversaciones significa que no se implementa
  backfill ni conversión de datos existentes. La feature sí debe incluir la
  migración de esquema necesaria para crear la instantánea, actualizar los
  constraints de slot y soportar el nuevo contrato sobre una base limpia.

## Terminología y límites de responsabilidad

### Provider adapter

Un adapter encapsula un protocolo externo y su credencial. La orquestación solo
conoce el contrato normalizado `LlmProvider`; nunca ramifica por nombre de
provider ni construye payloads externos.

Los adapters soportados por la arquitectura son:

- `openai`: API directa de OpenAI.
- `google`: API directa de Google Gemini.
- `minimax`: API directa de MiniMax, conservada para extensibilidad.
- `qwen`: API directa de Qwen, conservada para extensibilidad.
- `openrouter`: gateway OpenRouter.

La primera versión expone en el catálogo únicamente los deployments listados en
la sección siguiente. Los adapters directos de MiniMax y Qwen permanecen
disponibles como extensiones del registro, pero no tienen un deployment inicial
en el catálogo.

Agregar un provider futuro requiere solamente implementar el contrato del
adapter, declarar su credencial y registrar sus deployments; no requiere crear
un slot ni modificar el orquestador.

### Deployment

Un deployment es una configuración estática e identificable que contiene:

- `deploymentId`: identificador público estable y único.
- `displayName`: nombre mostrado al usuario.
- `providerId`: adapter que ejecuta la llamada.
- `modelId`: identificador exacto enviado al provider.
- `contextLimitTokens`: límite técnico de entrada usado por `ContextBuilder`.
- `maxOutputTokens`: límite operativo de salida opcional; cuando está presente
  se envía al provider sin cambios y, cuando está ausente, el provider elige su
  valor por defecto.
- `inputModalities` y `outputModalities`: capacidades declaradas por el modelo.
- credencial requerida para determinar disponibilidad.

El catálogo no contiene claves, endpoints secretos, prompts ni precios.

## Catálogo actual exacto

El catálogo es estático en el backend. No se consulta ni se actualiza desde un
endpoint externo durante el arranque o durante una conversación.

Los `deploymentId` son exactamente los siguientes y deben conservarse como
identificadores estables:

| deploymentId                        | displayName            | providerId   | modelId enviado al provider       | contextLimitTokens | maxOutputTokens |
| ----------------------------------- | ---------------------- | ------------ | --------------------------------- | -----------------: | --------------- |
| `openrouter-minimax-m3`             | MiniMax M3             | `openrouter` | `minimax/minimax-m3`              |             524288 | ausente         |
| `openrouter-minimax-m2.7`           | MiniMax M2.7           | `openrouter` | `minimax/minimax-m2.7`            |             204800 | ausente         |
| `openrouter-qwen-3.8-max`           | Qwen 3.8 Max           | `openrouter` | `qwen/qwen3.8-max`                |            1000000 | ausente         |
| `openrouter-kimi-k3`                | Kimi K3                | `openrouter` | `moonshotai/kimi-k3`              |            1048576 | ausente         |
| `openrouter-glm-5.2`                | GLM 5.2                | `openrouter` | `z-ai/glm-5.2`                    |            1048576 | ausente         |
| `openrouter-deepseek-v4-flash-0731` | DeepSeek V4 Flash 0731 | `openrouter` | `deepseek/deepseek-v4-flash-0731` |            1048576 | ausente         |
| `gemini-3.7-flash`                  | Gemini 3.7 Flash       | `google`     | `gemini-3.7-flash`                |            1048576 | ausente         |
| `openai-5.6-sol`                    | GPT-5.6 Sol            | `openai`     | `gpt-5.6-sol`                     |            1050000 | ausente         |
| `openai-5.6-terra`                  | GPT-5.6 Terra          | `openai`     | `gpt-5.6-terra`                   |            1050000 | ausente         |
| `openai-5.6-luna`                   | GPT-5.6 Luna           | `openai`     | `gpt-5.6-luna`                    |            1050000 | ausente         |
| `openrouter-nemotron-3-ultra-550b-a55b-free` | Nemotron 3 Ultra (Free) | `openrouter` | `nvidia/nemotron-3-ultra-550b-a55b:free` | 1000000 | ausente |
| `openrouter-nemotron-3.5-lightning-free` | Nemotron 3.5 Lightning (Free) | `openrouter` | `nvidia/nemotron-3.5-lightning:free` | 1000000 | ausente |
| `openrouter-qwen-3.8-27b-free`      | Qwen 3.8 27B (Free)   | `openrouter` | `qwen/qwen3.8-27b:free`           |             262144 | ausente         |
| `openrouter-gemma-4-26b-a4b-it-free` | Gemma 4 26B A4B (Free) | `openrouter` | `google/gemma-4-26b-a4b-it:free` |             262144 | ausente         |
| `openrouter-gemma-4-31b-it-free`    | Gemma 4 31B (Free)    | `openrouter` | `google/gemma-4-31b-it:free`      |             262144 | ausente         |

`maxOutputTokens` es opcional y debe ser un entero positivo cuando está
presente. En las quince filas actuales está ausente: el adapter omite el parámetro
nativo de límite de salida y cada provider elige su valor por defecto. Cuando el
campo está presente, el adapter lo envía sin cambios mediante el parámetro nativo
equivalente; OpenRouter usa `max_tokens`. No se permite clamp, negociación,
discovery, sustitución ni retry del valor. El campo nunca participa en el cálculo
del límite de entrada ni causa truncamiento local de una respuesta.

Los límites de API y aplicación representan la ausencia omitiendo la propiedad,
nunca mediante `null`, `undefined` o `0`; PostgreSQL la representa con `NULL`.
La instantánea inmutable conserva la decisión de delegar el límite al provider,
pero ese valor por defecto puede cambiar externamente, por lo que esa decisión no
garantiza reproducibilidad exacta del límite de salida.

Las capacidades actuales exactas son:

| deploymentId                        | inputModalities                          | outputModalities |
| ----------------------------------- | ---------------------------------------- | ---------------- |
| `openrouter-minimax-m3`             | `text`, `image`, `video`                 | `text`           |
| `openrouter-minimax-m2.7`           | `text`                                   | `text`           |
| `openrouter-qwen-3.8-max`           | `text`, `image`, `video`                 | `text`           |
| `openrouter-kimi-k3`                | `text`, `image`, `video`                 | `text`           |
| `openrouter-glm-5.2`                | `text`                                   | `text`           |
| `openrouter-deepseek-v4-flash-0731` | `text`                                   | `text`           |
| `gemini-3.7-flash`                  | `text`, `image`, `video`, `audio`, `pdf` | `text`           |
| `openai-5.6-sol`                    | `text`, `image`                          | `text`           |
| `openai-5.6-terra`                  | `text`, `image`                          | `text`           |
| `openai-5.6-luna`                   | `text`, `image`                          | `text`           |
| `openrouter-nemotron-3-ultra-550b-a55b-free` | `text` | `text` |
| `openrouter-nemotron-3.5-lightning-free` | `text` | `text` |
| `openrouter-qwen-3.8-27b-free`      | `text`, `image`, `video`                 | `text`           |
| `openrouter-gemma-4-26b-a4b-it-free` | `text`, `image`, `video`                | `text`           |
| `openrouter-gemma-4-31b-it-free`    | `text`, `image`, `video`                 | `text`           |

Estas capacidades se exponen como metadata del catálogo. Esta feature conserva
el composer de texto actual y no incorpora carga de imágenes, audio, video o
PDF; declarar una modalidad no habilita por sí mismo una entrada nueva en la UI.

Para los deployments de OpenRouter, `contextLimitTokens` usa el límite de
`top_provider.context_length`, que es la cota efectiva de la ruta seleccionada,
no el límite máximo agregado que OpenRouter publica para el modelo.

La lista admite `:free` únicamente en los cinco `modelId` normativos que lo
incluyen. No admite variantes `:batch`, aliases `latest`, variantes gratuitas no
listadas, otros aliases, fallback, sustitución, discovery en runtime ni otros
modelos. Para GLM se usa exactamente `z-ai/glm-5.2`; para DeepSeek se usa
exactamente la versión fechada `deepseek/deepseek-v4-flash-0731`.

## Perfil por defecto

Cuando el usuario crea una conversación sin especificar asignaciones, el backend
aplica exactamente este perfil:

| Slot           | Deployment por defecto    |
| -------------- | ------------------------- |
| `base-1`       | `openai-5.6-sol`          |
| `base-2`       | `gemini-3.7-flash`        |
| `base-3`       | `openrouter-minimax-m3`   |
| `consolidator` | `openrouter-qwen-3.8-max` |

El perfil por defecto solo puede aplicarse si las cuatro credenciales requeridas
están configuradas. Si falta cualquiera, la creación sin asignaciones se
rechaza con `503 DEFAULT_PROFILE_UNAVAILABLE`; el cuerpo contiene únicamente un
mensaje seguro y los `deploymentId` faltantes, nunca el secreto ni la respuesta
del provider.

## Credenciales y disponibilidad

Cada adapter declara una credencial requerida:

| providerId   | Variable de entorno  |
| ------------ | -------------------- |
| `openai`     | `OPENAI_API_KEY`     |
| `google`     | `GOOGLE_API_KEY`     |
| `minimax`    | `MINIMAX_API_KEY`    |
| `qwen`       | `QWEN_API_KEY`       |
| `openrouter` | `OPENROUTER_API_KEY` |

Las credenciales son opcionales a nivel de instalación. El backend no debe
fallar al arrancar porque falte una credencial opcional.

`GET /api/v1/model-catalog` devuelve únicamente deployments cuya credencial
requerida está configurada. No devuelve entradas no disponibles con un valor
falso ni expone la razón interna de disponibilidad.

Si una petición de creación contiene un `deploymentId` que no está disponible,
el backend responde `422 DEPLOYMENT_UNAVAILABLE`. La UI solo presenta para
selección las entradas devueltas por el catálogo, pero la validación del backend
es obligatoria.

## Regla de unicidad por conversación

Una misma conversación no puede asignar el mismo `deploymentId` a dos slots.
La validación se ejecuta en frontend y backend, y el backend la refuerza en la
transacción de creación.

La regla se aplica al identificador de deployment completo, no al modelo
subyacente ni al nombre mostrado. Por tanto:

- repetir `openrouter-glm-5.2` en dos slots es inválido;
- usar un deployment directo de GLM y otro deployment de GLM vía OpenRouter es
  válido si tienen `deploymentId` distintos;
- usar deployments del mismo provider en slots diferentes es válido si sus
  `deploymentId` son distintos.

Una selección duplicada responde `422 DUPLICATE_DEPLOYMENT_ASSIGNMENT` y no crea
filas ni inicia llamadas externas.

## Contrato de selección de una conversación nueva

El endpoint existente de creación de conversación acepta un campo opcional con
esta forma exacta:

```json
{
  "deploymentIds": {
    "base-1": "openai-5.6-sol",
    "base-2": "gemini-3.7-flash",
    "base-3": "openrouter-minimax-m3",
    "consolidator": "openrouter-qwen-3.8-max"
  }
}
```

Las cuatro claves son obligatorias cuando `deploymentIds` está presente. No se
aceptan claves adicionales, valores vacíos ni `null`. Si el campo está ausente,
se usa el perfil por defecto. La respuesta de creación y el detalle de la
conversación incluyen, por slot, `deploymentId`, `providerId`, `modelId` y
`displayName` provenientes de la instantánea persistida.

Ningún endpoint de turnos, retry, recovery, rename o eliminación acepta cambios
de `deploymentIds`.

## Instantánea persistida

La creación debe persistir en una transacción, antes de iniciar cualquier
provider, una fila por slot con:

- `conversationId`;
- `slot`;
- `deploymentId`;
- `providerId`;
- `modelId`;
- `displayName`;
- `contextLimitTokens`;
- `maxOutputTokens` opcional, persistido como `NULL` cuando está ausente;
- `inputModalities`;
- `outputModalities`;
- timestamps de creación y actualización.

La clave primaria es `(conversationId, slot)` y existe una restricción única
`(conversationId, deploymentId)`. Las filas son inmutables después de la
creación. `model_responses` y `ContextBuilder` consumen esta instantánea; no
leen una variable de entorno de modelo ni resuelven un deployment por nombre de
slot.

## API del catálogo y UI

- `GET /api/v1/model-catalog` devuelve las entradas disponibles ordenadas por
  `displayName` y sin secretos, precios, créditos ni datos de billing.
- La pantalla de nueva conversación muestra cuatro selectores, uno por slot,
  preseleccionados con el perfil por defecto cuando está disponible.
- Cada selector muestra `displayName` y `providerId`.
- Los cuatro selectores pueden elegir cualquier entrada disponible.
- La UI bloquea duplicados y muestra el error de validación antes de enviar.
- Una conversación existente muestra su asignación como solo lectura.
- La UI no ofrece un control para reemplazar un deployment durante una
  conversación.

## Ejecución de providers

El registro pasa a estar indexado por `providerId` y el orquestador recibe un
deployment resuelto por slot. Para OpenRouter:

- se usa `POST https://openrouter.ai/api/v1/chat/completions`;
- se envía `Authorization: Bearer $OPENROUTER_API_KEY`;
- `model` es el `modelId` exacto del catálogo y se reenvía sin cambios,
  incluido el sufijo normativo `:free` cuando corresponde;
- `max_tokens` se omite cuando `maxOutputTokens` está ausente y recibe su valor
  exacto cuando está presente;
- se conserva el contrato normalizado de mensajes, cancelación, timeout y una
  sola llamada externa por intento;
- no se usan routing gratuito automático, fallbacks, sustituciones ni reintentos
  automáticos.

Los adapters directos conservan sus protocolos propios. Ningún adapter comparte
payloads externos con otro provider por el solo hecho de que OpenRouter sea
compatible con el formato de OpenAI.

## Métricas, contexto y errores

- OpenRouter debe producir exactamente las mismas métricas normalizadas que los
  providers existentes: `inputTokens`, `outputTokens` y `totalTokens` cuando el
  upstream las informe.
- No se añaden ni persisten métricas de precio, costo, moneda, billing, créditos,
  presupuesto ni consumo económico para OpenRouter.
- La protección técnica de contexto usa el `contextLimitTokens` del deployment,
  el ratio técnico existente y el medidor exacto o cota superior ya exigidos por
  el contrato. No se persisten prompts compuestos ni conteos de tokens.
- Los errores de OpenRouter se normalizan a la matriz existente: 401 es
  `authentication`, 429 es `rate_limited`, 408/502/503 son
  `provider_transient_error` y 402 es `provider_error` con mensaje seguro, sin
  exponer ni modelar créditos. Un error se clasifica como `content_blocked` solo
  si `error.metadata.error_type` es `content_policy_violation` o `refusal`, o si
  un 403 contiene `error.metadata.reasons` o `error.metadata.patterns` como
  arrays no vacíos. Cualquier otro 403 es `provider_error`. La clasificación
  inspecciona únicamente esos campos estructurados, nunca texto libre, y
  descarta toda metadata upstream después de clasificarla.
- Ningún error expone headers, bodies upstream, stacks, claves o prompts.

## Aceptación obligatoria

La feature solo está completa cuando se demuestra todo lo siguiente:

1. El catálogo devuelve exactamente los quince deployments actuales disponibles
   cuando están configuradas sus tres credenciales (`OPENAI_API_KEY`,
   `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`).
2. El perfil por defecto crea la asignación exacta indicada y la persiste como
   instantánea.
3. Una conversación puede asignar cualquier deployment disponible a cualquier
   slot, siempre que no repita `deploymentId`.
4. La duplicación de deployment se rechaza atómicamente y no llama providers.
5. Una conversación creada conserva sus deployments aunque cambie el catálogo o
   la configuración del proceso; sus turnos posteriores usan la instantánea.
6. La UI y la API rechazan el reemplazo de un deployment después de crear la
   conversación.
7. Falta de credencial filtra el deployment del catálogo y rechaza una selección
   directa con el código definido.
8. El adapter OpenRouter normaliza contenido, métricas, cancelación, timeout y
   errores con los mismos contract tests que los adapters existentes.
9. Las pruebas verifican que no se registran ni persisten precios, créditos,
   billing o presupuesto.
10. Las pruebas de contexto usan los `contextLimitTokens` exactos de la tabla y
    comprueban que no se llama al provider cuando el payload mínimo excede el
    umbral.
11. Los contract tests verifican que la ausencia de `maxOutputTokens` omite el
    campo nativo y delega el default al provider, y que un valor positivo presente
    se envía sin cambios sin ajuste, negociación, discovery, sustitución ni retry.
12. El catálogo expone exactamente las modalidades declaradas y la UI continúa
    aceptando únicamente texto.
13. API, persistencia, SSE y UI rechazan los identificadores de slot anteriores
    y usan exclusivamente los cuatro identificadores lógicos nuevos.
14. La migración de esquema se aplica correctamente sobre una base limpia sin
    ejecutar backfill de conversaciones.

## Fuentes oficiales consultadas

- [Catálogo y API de modelos de OpenRouter](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [Catálogo actual de modelos de OpenRouter](https://openrouter.ai/api/v1/models)
- [Endpoint Chat Completions de OpenRouter](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)
- [Errores tipados y metadata de moderación de OpenRouter](https://openrouter.ai/docs/api/reference/errors-and-debugging)
- [Modelos de OpenAI](https://developers.openai.com/api/docs/models)
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Catálogo de modelos Gemini](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash)
