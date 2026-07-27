# Quickstart: ModelFuse Conversation Comparison

## Prerequisites

- Node.js 22+
- pnpm 11
- Docker con Compose
- Credenciales para OpenAI, Google, MiniMax y Qwen

## 1. Install

```bash
pnpm install
```

La implementación añade TanStack Query al frontend y Playwright para E2E.
Backend reutiliza Axios, `pg`, Zod, Pino, Vitest y Supertest. No añade librería de
retry ni infraestructura genérica de idempotencia.

## 2. Configure backend

Copiar `apps/backend/.env.sample` a `apps/backend/.env`:

```dotenv
PORT=3001
NODE_ENV=development
FRONTEND_URL_LOCALHOST=http://localhost:5173
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=db_dev

OPENAI_API_KEY=
OPENAI_MODEL=
GOOGLE_API_KEY=
GOOGLE_MODEL=
MINIMAX_API_KEY=
MINIMAX_MODEL=
QWEN_API_KEY=
QWEN_MODEL=

# Provider BASE_URL only when the selected deployment requires it.

LLM_PROVIDER_TIMEOUT_MS=
CONVERSATION_CONTEXT_MAX_TURNS=
CONVERSATION_SIDEBAR_PAGE_SIZE=
```

Credenciales reales no pertenecen a `.env.sample`, logs ni datos
conversacionales. Una variable requerida ausente impide startup e identifica solo
su nombre.

`CONVERSATION_CONTEXT_MAX_TURNS` acota turnos relevantes; no define presupuesto,
estimación ni límite de tokens por modelo.

## 3. Configure frontend

```dotenv
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD=
```

Frontend genera `clientRequestId` mediante `crypto.randomUUID()`; no requiere
configuración.

## 4. Start PostgreSQL and migrate

```bash
docker compose up -d postgres_template
docker compose run --rm liquibase_template
```

Liquibase aplica módulos `conversations` y `messages`. No se ejecutan cambios
manuales de esquema.

## 5. Run

```bash
pnpm dev
```

- Backend: `http://localhost:3001`
- API: `http://localhost:3001/api/v1`
- Frontend: URL impresa por Vite

## 6. Core smoke flow

1. Enviar un prompt y verificar tabs OpenAI, Google, MiniMax y Qwen.
2. Confirmar tres bases en paralelo y consolidación con respuestas disponibles.
3. Durante `pending`/`running`, verificar aviso de procesamiento, Enviar disabled
   y todos los Retry disabled en esa conversación.
4. Navegar a otra conversación y comprobar que sus acciones dependen de su propio
   busy; resultados siguen guardándose en la conversación de origen.
5. Al terminar todos los slots, verificar que acciones se reactivan incluso si el
   turno queda `failed` o `partial`.

## 7. Idempotency and concurrency smoke flow

1. Enviar dos veces `POST /conversations` con el mismo `clientRequestId` y prompt:
   ambas respuestas deben referir a la misma conversación/turno y providers deben
   ejecutarse una sola vez.
2. Repetir `POST /conversations/:id/turns` con el mismo ID/prompt mientras el
   turno está activo: debe devolver el turno original, no `CONVERSATION_BUSY`.
3. Enviar un ID nuevo a esa conversación mientras cualquier turno/slot está
   `pending`/`running`: debe responder `409 CONVERSATION_BUSY`.
4. Terminar el trabajo como `partial` o `failed` sin estados activos y repetir con
   otro ID nuevo: debe aceptar el turno.
5. Reutilizar un ID con prompt distinto: debe responder
   `409 CLIENT_REQUEST_ID_CONFLICT`.
6. En dos conversaciones distintas, comprobar que busy en una no bloquea a la
   otra.

## 8. Retry and first failure smoke flow

1. Forzar la primera falla recuperable de una base mientras otra sigue running.
2. Verificar que Retry y Continue-without aparecen inmediatamente, sin otra
   llamada automática.
3. Verificar Retry visible pero disabled por busy; Continue-without permanece
   disponible.
4. Cuando no quede trabajo, verificar Retry habilitado para el slot fallido.
5. Enviar dos retries simultáneos del mismo slot: solo uno debe aceptarse; el otro
   recibe `RESPONSE_RETRY_IN_PROGRESS`.
6. Forzar retry base fallido: Qwen no debe invocarse ni invalidarse.
7. Forzar retry base exitoso: Qwen previo queda stale y una nueva consolidación lo
   reemplaza.
8. Forzar Qwen fallido: bases permanecen visibles y solo Qwen ofrece retry cuando
   la conversación deja de estar busy.
9. Ejecutar Continue-without sobre base fallida: persiste la ausencia sin llamada
   de provider ni estado activo nuevo.

## 9. Context and history smoke flow

1. Crear follow-up y capturar mensajes fake: cada base ve solo su historial;
   Qwen ve su historial y respuestas base actuales.
2. Reducir la ventana, crear suficientes turnos y verificar
   `contextWindow.truncated=true` con ordinales.
3. Confirmar aviso textual de truncamiento y ausencia de prompt compuesto/contexto
   duplicado en PostgreSQL.
4. Crear siete turnos, recargar y verificar solo los tres recientes.
5. Hacer scroll arriba y comprobar bloques anteriores de hasta tres sin salto.
6. Desbordar sidebar y comprobar scroll descendente/autofill.
7. Comprobar “Mostrar más / Mostrar menos” sin red ni escrituras.
8. Verificar rename, cancelación y delete confirmado.

## 10. Recovery acceptance

1. Preparar cada caso versionado con slots `pending`, `running` y completados.
2. Recrear aplicación/servicios sobre la misma PostgreSQL.
3. Verificar reconciliación terminal, recálculo de turno y busy=false cuando no
   queden estados activos.
4. Verificar orden, atribución, estados coherentes y consulta posterior.
5. Exigir éxito en el 100% de casos del conjunto de recuperación, sin extrapolar
   a todos los casos posibles.

## 11. Controlled latency acceptance

Con PostgreSQL local y providers fake:

1. medir cada `POST /api/v1/conversations`;
2. medir cada primera consulta de historial;
3. verificar `202` para create;
4. exigir menos de un segundo para ambos endpoints en al menos el 95% de
   ejecuciones del conjunto controlado.

No es garantía global de producción ni de providers reales.

## 12. Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose run --rm liquibase_template validate
```

Después de implementación:

```bash
pnpm --filter frontend test:e2e
pnpm --filter backend test:acceptance-latency
pnpm --filter backend test:consolidation-eval
```

- aceptación de latencia reporta total/éxitos por endpoint y exige 95%;
- evaluación procesa máximo cinco casos y falla debajo del 90% de checks;
- tests predeterminados usan fakes y no providers pagados.

## Troubleshooting

- `CONVERSATION_BUSY`: esperar que no queden turnos/slots pending/running en esa
  conversación; otras siguen disponibles.
- Replay idempotente: reutilizar el mismo ID solo para el mismo submit/prompt.
- `RESPONSE_RETRY_IN_PROGRESS`: el mismo slot ya tiene un retry activo.
- Credencial rechazada/timeout: solo falla su slot; no hay retry automático.
- Contexto acotado: UI muestra el tramo; DB conserva historial completo.
- Recovery: slots interrumpidos quedan terminales y manualmente recuperables.
- Liquibase: corregir changeset; no editar PostgreSQL manualmente.
