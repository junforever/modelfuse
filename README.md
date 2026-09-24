# ModelFuse

ModelFuse es una plataforma web full-stack para comparar y fusionar respuestas de varios modelos de lenguaje dentro de una conversación multiturno. Cada turno conserva sus respuestas, estados y metadatos en PostgreSQL, mientras el frontend recibe cambios en tiempo real mediante Server-Sent Events (SSE).

El sistema usa tres respuestas base en paralelo y una respuesta consolidada que combina sus resultados. Las integraciones con proveedores son intercambiables y las credenciales se configuran mediante variables de entorno.

## Capacidades principales

- Conversaciones multiturno con historial persistente.
- Tres slots base (`base-1`, `base-2`, `base-3`) y un slot consolidator.
- Selección de deployments al crear una conversación.
- Catálogo estático de deployments filtrado por las credenciales disponibles.
- Snapshot inmutable del deployment asignado a cada slot.
- Streaming SSE para actualizaciones de turnos y respuestas.
- Reintento de respuestas fallidas y continuación sin una respuesta base.
- Recuperación de trabajo interrumpido después de reinicios.
- Adaptadores para OpenAI, Google y OpenRouter, con soporte de proveedores adicionales en la infraestructura del backend.

## Flujo funcional

1. El usuario crea una conversación y, opcionalmente, asigna un `deploymentId` a cada slot.
2. El backend persiste la conversación y sus cuatro snapshots de deployment.
3. Cada turno se envía a los tres modelos base en paralelo.
4. El consolidator recibe las respuestas disponibles y genera una respuesta unificada.
5. El backend persiste cada transición y publica actualizaciones por SSE.
6. El frontend muestra el historial, los estados y las respuestas por slot.

Los endpoints principales están bajo `/api/v1`:

- `GET /api/v1/model-catalog`
- `GET|POST /api/v1/conversations`
- `GET|PATCH|DELETE /api/v1/conversations/:conversationId`
- `GET|POST /api/v1/conversations/:conversationId/turns`
- `GET /api/v1/conversations/:conversationId/turns/:turnId`
- `GET /api/v1/conversations/:conversationId/turns/:turnId/events`
- `POST /api/v1/conversations/:conversationId/turns/:turnId/responses/:slot/retry`
- `POST /api/v1/conversations/:conversationId/turns/:turnId/responses/:slot/continue-without`

## Arquitectura

```text
Frontend (React + Vite + TypeScript)
  AppShell
  ConversationWorkspace
    ConversationSidebar
    PromptComposer
    TurnList / TurnCard
    ResponseTabs / ResponsePanel
    DeploymentSelectors
          │ REST + SSE
          ▼
Backend (Node.js + Express + TypeScript)
  Middleware y validación Zod
  Controllers y rutas /api/v1
  ConversationService
  TurnOrchestrator + ContextBuilder
  Recuperación y publicación de eventos SSE
  ProviderRegistry + adaptadores LLM
          │
          ▼
PostgreSQL + Liquibase
  conversations
  turns
  model_responses
  conversation_deployments
```

## Estructura del repositorio

```text
modelfuse/
├── apps/
│   ├── frontend/          # React, Vite, React Query y Playwright
│   └── backend/           # Express, servicios, rutas y adaptadores LLM
├── packages/
│   └── ui/                # Componentes visuales compartidos
├── db/
│   └── changelogs/        # Changelogs SQL de Liquibase
├── agent-scripts/         # Inicialización de runtime y preflights
├── specs/                 # Especificaciones y contratos técnicos
├── turbo.json             # Orquestación del monorepo
├── pnpm-workspace.yaml
└── README.md
```

## Modelo de datos

| Tabla | Propósito |
| --- | --- |
| `conversations` | Identidad, título, estado y timestamps de la conversación. |
| `turns` | Prompt, ordinal, estado y relación con una conversación. |
| `model_responses` | Respuesta por slot, estado, contenido, errores, intentos y metadatos. |
| `conversation_deployments` | Snapshot inmutable del deployment asignado a cada slot. |

Los slots válidos son exactamente `base-1`, `base-2`, `base-3` y `consolidator`. Los estados de las respuestas son `pending`, `running`, `completed` y `failed`; los turnos también pueden estar `partial` cuando solo una parte de sus respuestas está disponible.

## Configuración

1. Copia las plantillas de entorno:

   ```powershell
   Copy-Item apps/backend/.env.sample apps/backend/.env
   Copy-Item apps/frontend/.env.sample apps/frontend/.env
   ```

2. Completa `apps/backend/.env` con la configuración de PostgreSQL, los límites de ejecución, el origen permitido del frontend y las credenciales de los proveedores que quieras habilitar.

3. Verifica que `VITE_API_BASE_URL` en `apps/frontend/.env` apunte al backend. El valor local predeterminado es `http://localhost:3001/api/v1`.

No guardes secretos en el repositorio. El catálogo solo expone deployments cuya variable de credenciales está configurada.

## Primera inicialización

El proyecto requiere Node.js 22 o superior, pnpm 11.22.0, Docker Desktop con Compose y una cuenta de proveedor LLM para los modelos que se quieran usar.

### 1. Instalar dependencias

Desde la raíz del repositorio:

```powershell
pnpm install
```

### 2. Configurar los archivos `.env`

```powershell
Copy-Item apps/backend/.env.sample apps/backend/.env
Copy-Item apps/frontend/.env.sample apps/frontend/.env
```

Completa `apps/backend/.env` con:

- `PORT`, `NODE_ENV` y `FRONTEND_URL_LOCALHOST`.
- Los valores `POSTGRES_*` de la base que usará el backend.
- Los límites `REQUEST_*`, `LLM_PROVIDER_TIMEOUT_MS`, `CONVERSATION_CONTEXT_MAX_TURNS`, `LLM_CONTEXT_THRESHOLD_RATIO` y `CONVERSATION_SIDEBAR_PAGE_SIZE`.
- Las API keys de los proveedores cuyos deployments se utilizarán (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY` y las demás cuando correspondan).

En `apps/frontend/.env`, verifica `VITE_API_BASE_URL`. Para desarrollo local debe apuntar normalmente a `http://localhost:3001/api/v1`.

Ningún archivo `.env` debe incluirse en Git.

### 3. Crear la base y ejecutar Liquibase

La definición principal crea PostgreSQL, pgAdmin y un job de Liquibase. Desde la raíz, inicia los tres servicios:

```powershell
docker compose --file docker-compose.yml --env-file apps/backend/.env up -d
```

Comprueba el resultado:

```powershell
docker compose --file docker-compose.yml ps -a
```

El estado esperado es `postgres_template` saludable, `pgadmin_template` activo y `liquibase_template` terminado con código `0`. Que Liquibase aparezca como `exited (0)` es correcto: es un job de una sola ejecución y aplica `update` contra PostgreSQL. Las migraciones se cargan desde `db/changelogs/db.changelog-master.xml` y sus changelogs incluidos.

pgAdmin queda disponible en `http://localhost:8080`. Usa por defecto el correo `admin@admin.com` y la clave `admin`, definidos en `apps/backend/.env.sample`, para acceder y consultar la base. Para conectar pgAdmin al servidor desde dentro de Docker, utiliza `postgres_template` como host y `5432` como puerto.

Si Docker Desktop o la máquina se reinician, PostgreSQL y pgAdmin se vuelven a iniciar por su política `unless-stopped`. Si Liquibase vuelve a aparecer como `exited (0)`, no es un error; solo debe ejecutarse de nuevo si se quiere aplicar o comprobar una migración.

### 4. Iniciar la aplicación

```powershell
pnpm run dev
```

La interfaz queda disponible normalmente en `http://localhost:5173` y el backend en `http://localhost:3001`.

## Desarrollo con agentes

Esta sección aplica al trabajo ejecutado por Codex u otros agentes del repositorio. La ruta rápida es clasificar qué usa el bloque y no validar perfiles ajenos:

| Necesidad del bloque | Acción previa | Cuándo repetir |
| --- | --- | --- |
| Node/pnpm normal | Ejecutar el comando mediante `run-pnpm.ps1`; el wrapper valida rutas cacheadas y versiones exactas en cada invocación. | Ejecutar `initialize-runtime.ps1` solo si `runtime.local.json` falta, es inválido o está stale, el wrapper reporta un mismatch, o se confirmó un cambio externo. Usar `-Force` solo para un reemplazo confirmado. |
| Python | Ejecutar `preflight-python.ps1` antes del primer comando Python, con la versión y los módulos realmente requeridos. | Solo si cambian los requisitos o el runtime Python. |
| Integración real | Ejecutar `preflight-integration.ps1 -EnvFile apps/backend/.env.integration` antes del primer uso real de Docker/Compose, PostgreSQL/Liquibase, Testcontainers o E2E con el backend de integración. | Solo tras cambios de Compose, env, servicios o máquina, invalidación previa o corrección externa confirmada. |
| Perfil no usado | Nada. | No aplica. |

Para un comando Node/pnpm normal, ejecutá directamente desde una sesión PowerShell:

```powershell
& .\agent-scripts\run-pnpm.ps1 -- run build
& .\agent-scripts\run-pnpm.ps1 -- --filter backend run typecheck
```

Para un comando que usa la integración real:

```powershell
& .\agent-scripts\preflight-integration.ps1 -EnvFile apps/backend/.env.integration
& .\agent-scripts\run-pnpm.ps1 -EnvFile apps/backend/.env.integration -- --filter frontend run test:e2e
```

El preflight se ejecuta una vez y su evidencia se reutiliza mientras siga vigente. El entorno que carga un preflight no persiste en procesos posteriores: cada comando que necesite variables de integración debe volver a pasar `-EnvFile apps/backend/.env.integration` al wrapper.

La forma canónica del wrapper es `& .\agent-scripts\run-pnpm.ps1 [opciones del wrapper] -- [argumentos literales de pnpm]`. La frontera `--` del wrapper aparece una sola vez; cualquier `--` posterior pertenece a pnpm o al script y debe conservarse. No envuelvas esta invocación en `powershell -File` cuando necesites tokens `--` literales, porque PowerShell puede enlazarlos antes de que el script los reciba.

Herramientas y preflights del agente:

- `run-pnpm.ps1`: valida el cache y las versiones de Node.js/pnpm en cada invocación, ejecuta pnpm y conserva su código de salida.
- `initialize-runtime.ps1`: crea o actualiza la configuración local cuando el cache falta, es inválido o está stale; `-Force` queda reservado para un reemplazo de runtime confirmado.
- `preflight-python.ps1`: valida únicamente la versión y los módulos Python requeridos por el bloque.
- `preflight-integration.ps1`: valida el entorno PostgreSQL/Liquibase de integración sin iniciarlo ni repararlo.

El entorno de integración de los agentes usa `docker-compose.integration.yml` y `apps/backend/.env.integration`:

```powershell
Copy-Item apps/backend/.env.integration.sample apps/backend/.env.integration
```

Antes de usarlo, cambia `MODELFUSE_TEST_DATABASE_PASSWORD` por una contraseña local. No ejecutes el preflight de integración para unit, build, typecheck, lint ni integraciones con infraestructura totalmente mockeada.

Los permisos normales del host son el valor predeterminado. Solicitá elevación solo después de conservar un error concreto de permiso denegado que demuestre que hace falta; no eleves checks o comandos de forma especulativa.

Los preflights solo validan disponibilidad y configuración: no demuestran que la aplicación o los tests pasen, y no inician, instalan ni reparan runtimes o servicios. Reutilizá la evidencia y no dupliques una validación ya ejecutada por su owner mientras no cambien el código, los requisitos o el estado relevante.

La configuración generada en `agent-scripts/runtime.local.json` es local, no contiene secretos y está excluida de Git.

## Principios técnicos

- Separación entre UI, orquestación, persistencia e infraestructura externa.
- Contratos tipados y validación de entradas en los boundaries HTTP.
- Adaptadores LLM desacoplados del flujo de conversación.
- Persistencia explícita de estados y errores observables.
- Componentes compartidos en `packages/ui` sin dependencias de una aplicación concreta.
- Configuración sensible exclusivamente mediante el entorno.

## Contribuir

Antes de proponer cambios, revisa la documentación técnica y los contratos relacionados con el área afectada. Mantén las responsabilidades separadas, añade las migraciones mediante Liquibase cuando corresponda y ejecuta las validaciones focalizadas antes de abrir un pull request.

Usa commits convencionales, por ejemplo: `feat:`, `fix:`, `test:` o `docs:`.

## Licencia

MIT.

_ModelFuse — comparación y fusión de LLMs con trazabilidad, streaming y recuperación._
