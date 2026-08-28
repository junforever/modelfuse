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

Esta sección aplica al trabajo ejecutado por Codex u otros agentes del repositorio. `initialize-runtime.ps1` prepara el runtime de herramientas para el agente; no es necesario para la ejecución normal de la aplicación si Node.js y pnpm ya están instalados y disponibles.

Inicializa el runtime una vez por entorno:

```powershell
.\agent-scripts\initialize-runtime.ps1
```

Los comandos de Node y pnpm del agente se ejecutan desde la raíz mediante `run-pnpm.ps1`:

```powershell
.\agent-scripts\run-pnpm.ps1 -- run build
.\agent-scripts\run-pnpm.ps1 -- run test
.\agent-scripts\run-pnpm.ps1 -- run lint
.\agent-scripts\run-pnpm.ps1 -- run typecheck
.\agent-scripts\run-pnpm.ps1 -- run format
```

Herramientas y preflights del agente:

- `initialize-runtime.ps1`: valida Node.js y pnpm y guarda la configuración local del runtime.
- `run-pnpm.ps1`: ejecuta pnpm con el runtime inicializado y conserva el código de salida.
- `preflight-python.ps1`: valida la versión y los módulos Python requeridos.
- `preflight-integration.ps1`: valida el entorno PostgreSQL/Liquibase de integración.

El entorno de integración de los agentes usa `docker-compose.integration.yml` y `apps/backend/.env.integration`:

```powershell
Copy-Item apps/backend/.env.integration.sample apps/backend/.env.integration
```

Antes de usarlo, cambia `MODELFUSE_TEST_DATABASE_PASSWORD` por una contraseña local. Antes de ejecutar comandos que dependan de un runtime o servicio, el agente debe ejecutar el preflight correspondiente. Para el entorno de integración:

```powershell
.\agent-scripts\preflight-integration.ps1 -EnvFile apps/backend/.env.integration
```

Los preflights de Node/pnpm, Python y Docker/Compose deben ejecutarse con la elevación real del host indicada en `AGENTS.md`. El preflight de integración no inicia ni repara servicios: valida que el entorno ya esté disponible.

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
