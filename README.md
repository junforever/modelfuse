# ModelFuse

**ModelFuse** es una plataforma web full-stack para comparar, evaluar y fusionar respuestas de múltiples modelos de lenguaje (LLMs) dentro de una misma conversación multiturno, con trazabilidad completa, streaming en tiempo real y recuperación ante fallos.

La idea central es simple: el usuario escribe un prompt una sola vez y recibe, en paralelo, respuestas de varios modelos distintos. Luego, un **cuarto modelo integrador** analiza las respuestas anteriores, toma sus mejores partes, añade lo que falte y genera una respuesta final más completa y refinada.

Este proyecto está diseñado como un **monorepo** orientado a escalabilidad, mantenimiento claro y colaboración asistida por agentes de IA. Está configurado con **pnpm workspaces, Vite, React, Express, TypeScript y Shadcn UI**.

---

## 🎯 Problema que resuelve

Una sola respuesta de un LLM rara vez es suficiente cuando se busca calidad, cobertura o contraste entre enfoques. ModelFuse permite:

- **Comparación sistemática:** evaluar qué modelo responde mejor ante los mismos prompts y en el mismo contexto.
- **Fusión de conocimiento:** combinar lo mejor de varias respuestas en una respuesta final enriquecida.
- **Trazabilidad completa:** saber exactamente qué turno, qué slot de ejecución y qué modelo generó cada respuesta.
- **Resiliencia:** si el servicio se cae, las conversaciones no se pierden; se recuperan con estados coherentes.
- **Reproducibilidad:** fixtures versionados de conversaciones permiten pruebas determinísticas y comparación histórica.

Esto convierte a ModelFuse en una herramienta útil para investigación, redacción, ideación, validación técnica y workflows avanzados de prompting.

---

## 🚀 Qué hace ModelFuse

La aplicación permite:

- Escribir un prompt desde una interfaz principal tipo chat.
- Enviar ese prompt a **tres modelos LLM distintos** en paralelo, cada uno respondiendo en su propio tab.
- Mostrar un **cuarto tab integrador**, donde un modelo genera una respuesta consolidada usando lo mejor de las tres respuestas previas.
- Mantener conversaciones de **múltiples turnos** con historial persistente.
- Guardar y recuperar el historial de conversaciones desde una barra lateral.
- Recibir respuestas en tiempo real vía **Server-Sent Events (SSE)**.
- Limpiar la sesión actual para iniciar una conversación nueva.
- Cargar API keys y configuraciones desde variables de entorno (`.env`).

---

## 🧠 Flujo funcional

1. El usuario escribe un prompt en el área principal de chat.
2. El sistema envía ese prompt a tres modelos distintos; cada modelo recibe solo su propio historial individual.
3. Cada modelo responde en su tab correspondiente.
4. El sistema pasa esas tres respuestas a un cuarto modelo integrador, junto con el historial consolidado propio de este último, pero sin los historiales completos de los otros modelos.
5. El cuarto modelo genera una respuesta unificada y enriquecida.
6. La conversación queda persistida en PostgreSQL para continuar iterando después.
7. El usuario puede reabrir conversaciones guardadas desde la barra lateral o limpiar la actual para comenzar una nueva.

### Flujo técnico por turno

1. `POST /conversations` → se genera `conversation_id`.
2. `POST /conversations/:id/turns` → se crea un turno con ordinal.
3. `SlotScheduler` asigna slots (uno por LLM configurado) en estado `pending`.
4. Los LLM Adapters invocan los modelos → slots pasan a `running`.
5. SSE emite deltas (`response:delta`) → el frontend actualiza la UI en tiempo real.
6. Las respuestas completan (`response:complete`) → slots a `completed`.
7. Todo queda persistido en PostgreSQL, trazable por `conversation_id`, `turn_id` y `slot_id`.

---

## 🏗️ Arquitectura general

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + TS)                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  AppShell.tsx    │  │ Conversation-    │  │  Comparison-     │   │
│  │  (layout, nav)   │  │ Workspace.tsx    │  │  Panel.tsx       │   │
│  │                  │  │  (turnos, SSE,   │  │  (side-by-side   │   │
│  │                  │  │   historial)     │  │   LLMs)          │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ Conversation-    │  │  PromptInput.tsx │  │  LLMProvider-    │   │
│  │ Sidebar.tsx      │  │  (envío, queue)  │  │  Selector.tsx    │   │
│  │  (lista, reopen) │  │                  │  │  (config models) │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ REST + SSE
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (Node.js + TS)                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  REST API        │  │  SSE Stream      │  │  LLM Adapters    │   │
│  │  /conversations  │  │  /events         │  │  (OpenAI, etc.)  │   │
│  │  /turns          │  │  turn:created    │  │                  │   │
│  │  /responses      │  │  response:delta  │  │                  │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Servicios Core                           │   │
│  │  • ConversationService  • TurnService  • ResponseService     │   │
│  │  • SlotScheduler        • RecoveryService                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PostgreSQL (persistencia)                      │
│  • conversations  • turns  • responses  • slots  • llm_providers    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Estructura del repositorio

```text
modelfuse/
├── apps/
│   ├── frontend/          # Aplicación web (React + Vite + TypeScript)
│   └── backend/           # Servidor API (Node.js + Express + TypeScript)
├── packages/
│   └── ui/                # Librería de componentes compartidos (Shadcn UI + Tailwind)
├── specs/
│   └── 001-compare-llm-responses/
│       ├── spec.md        # Especificación funcional completa
│       ├── tasks.md       # Tareas de implementación (T001–T118+)
│       ├── plan.md        # Plan de ejecución, fases y dependencias
│       ├── data-model.md  # Modelo de datos, tablas y relaciones
│       └── ...            # Documentos auxiliares (research, quickstart, etc.)
├── db/
│   └── changelogs/        # Migraciones SQL por módulo (Liquibase)
├── tests/
│   ├── integration/
│   │   └── recovery.integration.test.ts
│   └── fixtures/
│       └── recoveryCases.ts
└── README.md
```

---

## 🧩 Responsabilidades por capa

### `apps/frontend/`
Responsable de la experiencia de usuario y del flujo conversacional:

| Componente | Responsabilidad |
|---|---|
| `AppShell.tsx` | Layout principal, navegación entre sesiones, estado global de UI. |
| `ConversationWorkspace.tsx` | Área central: lista de turnos, envío de prompts, recepción SSE, atribución de respuestas a slots. |
| `ConversationSidebar.tsx` | Historial de conversaciones, selección, reapertura y estados (`pending`, `running`, `completed`, `failed`, `interrupted`). |
| `ComparisonPanel.tsx` | Vista lado a lado de respuestas de múltiples LLMs para el mismo turno. |
| `PromptInput.tsx` | Input de usuario, validación, enqueue de solicitudes, manejo de estados de envío. |
| `LLMProviderSelector.tsx` | Configuración de qué modelos se invocan para cada turno. |

### `apps/backend/`
Responsable de la orquestación del sistema. Sigue una arquitectura limpia orientada a responsabilidades:

| Módulo | Responsabilidad |
|---|---|
| `index.ts` | **Única responsabilidad**: levantar el servidor (puerto y graceful shutdown). |
| `app.ts` | Configuración de Express, middlewares globales y montado de rutas. |
| `controllers/` | Maneja peticiones HTTP (`req/res`), extrae parámetros e invoca la lógica necesaria. |
| `routes/` | Define endpoints de Express y los enlaza con sus controladores. |
| `middleware/` | Validación (Zod), autenticación, manejo centralizado de errores, logging. |
| `infrastructure/` | Conexiones a PostgreSQL, clientes LLM y servicios externos. |
| `utils/` | Funciones de apoyo y helpers genéricos. |
| `types/` | Declaraciones globales de tipos TypeScript. |

Los **servicios core** que orquestan la lógica de negocio son:

| Servicio | Responsabilidad |
|---|---|
| `ConversationService` | CRUD de conversaciones, estados e historial. |
| `TurnService` | Creación de turnos, ordinales y atribución a conversaciones. |
| `ResponseService` | Persistencia de respuestas, atribución a turnos y slots. |
| `SlotScheduler` | Asignación de slots de ejecución a LLMs, manejo de colas. |
| `RecoveryService` | Recuperación post-reinicio: conversión de slots `pending`/`running` a `failed`/`interrupted`. |
| `SSE Gateway` | Emisión de eventos en tiempo real: `turn:created`, `response:delta`, `response:complete`. |

### `packages/ui/`
Librería de componentes visuales compartidos y reutilizables. Debe mantenerse **100% desacoplada** de la lógica de negocio y de cualquier dependencia específica de una aplicación.

---

## 🗄️ Modelo de datos

| Tabla | Propósito |
|---|---|
| `conversations` | Metadatos de cada conversación (usuario, estado, timestamps). |
| `turns` | Turnos de conversación, ordinales y atribución a conversación. |
| `responses` | Respuestas de LLMs, atribución a turno y slot, contenido delta. |
| `slots` | Slots de ejecución con estado (`pending`, `running`, `completed`, `failed`, `interrupted`). |
| `llm_providers` | Configuración de proveedores (API keys, modelos, timeouts). |

### Estados de slots y transiciones

| Estado | Descripción | Transiciones |
|---|---|---|
| `pending` | Slot asignado, no iniciado. | → `running` |
| `running` | LLM invocándose, streaming en curso. | → `completed`, `failed`, `interrupted` |
| `completed` | Respuesta completa persistida. | — |
| `failed` | Error no recuperable. | — |
| `interrupted` | Error recuperable (`error_recoverable=true`). | → `pending` (reintentar) |

---

## 🔄 Recuperación ante fallos

El sistema está diseñado para sobrevivir a reinicios del servicio sin pérdida de datos:

- Al iniciar, `RecoveryService` escanea slots en estado `pending` o `running`.
- Los marca como `failed` o `interrupted` con `error_recoverable=true`.
- Conserva ordinales de turnos, atribución de respuestas y estados de conversación.
- Permite consultar el historial completo tras la recuperación.

> **Criterio de aceptación (SC-002):** tras recrear la aplicación sobre la misma BD, se verifica: conservación del orden de turnos, atribución correcta de respuestas a turno y slot, estados coherentes y consulta posterior del historial.

---

## 🔐 Configuración y entorno

Las credenciales y configuraciones sensibles se cargan desde un archivo `.env`. **Nunca se deben hardcodear secretos en el código fuente.**

Variables de entorno requeridas:

- `DATABASE_URL` — URL de conexión a PostgreSQL.
- `LLM_API_KEYS` — API keys de los proveedores LLM.
- `PORT` — Puerto del servidor backend.

---

## ⚡ Quickstart

```bash
# 1. Clonar el repositorio
git clone <repo-url> && cd modelfuse

# 2. Instalar dependencias
pnpm install

# 3. Configurar base de datos
psql -U postgres -f src/db/schema.sql

# 4. Configurar variables de entorno
cp .env.example .env  # y completar con tus valores

# 5. Iniciar backend
pnpm run dev:backend

# 6. Iniciar frontend
pnpm run dev:frontend

# 7. Abrir en el navegador
# http://localhost:3000
```

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| UI | Shadcn UI + Tailwind CSS |
| Monorepo | pnpm workspaces |
| Base de datos | PostgreSQL |
| Migraciones | Liquibase |
| Streaming | Server-Sent Events (SSE) |

---

## 📌 Principios del proyecto

Las decisiones de implementación dentro de ModelFuse deben alinearse con estos principios:

- **Separación clara de responsabilidades** entre UI, orquestación y datos.
- **Escalabilidad** para agregar más modelos o estrategias de fusión.
- **Persistencia conversacional real**, no solo prompts aislados.
- **UI consistente y reutilizable** a través de `packages/ui`.
- **Configuración sensible fuera del código** (`.env`).
- **Código comprensible tanto para humanos como para agentes de IA**.

---

## 🤖 Instrucciones para Agentes de IA

Si eres un agente de IA trabajando en este repositorio, **debes seguir estas reglas estrictamente**. La [constitución del proyecto](.specify/memory/constitution.md) es la autoridad principal; estas instrucciones operativas deben interpretarse dentro de sus límites.

### Gestión de Componentes UI (Shadcn)

Para saber qué componentes de Shadcn UI existen, usa siempre `list_dir` para explorar `packages/ui/src/components`. Para agregar uno nuevo:

```bash
pnpm dlx shadcn@latest add <nombre-componente> -c apps/frontend
```

> Aunque se ejecuta con `-c apps/frontend`, el componente se instalará en `packages/ui/src/components` gracias a la configuración de `components.json`.

Todos los componentes en el frontend deben importarse desde el paquete compartido:

```tsx
import { Button } from '@workspace/ui/components/button';
```

Nunca introduzcas dependencias específicas de una aplicación dentro de `packages/ui`.

### Base de Datos y Migraciones (Liquibase)

- Toda creación o modificación de BD (tablas, views, triggers, procedures) DEBE hacerse con scripts SQL formateados para Liquibase (`-- liquibase formatted sql`).
- Las migraciones se organizan en subcarpetas por módulo dentro de `db/changelogs/` (ej. `db/changelogs/modulo_usuarios/001-init.sql`).
- Todo nuevo changelog de módulo debe incluirse en su `db.changelog-<modulo>.xml`, que a su vez se importa en `db/changelogs/db.changelog-master.xml`.

### Nuevas features

Cuando implementes nuevas funcionalidades, mantén separadas estas responsabilidades:

- UI y estado visual en frontend.
- Orquestación de modelos y persistencia en backend.
- Componentes reutilizables en `packages/ui`.
- Integraciones externas dentro de `infrastructure/`.

### Integraciones con LLMs

Toda integración con modelos externos debe ser:

- configurable por `.env`,
- desacoplada del proveedor,
- extensible para nuevos modelos,
- reutilizable para flujos de comparación, evaluación o fusión.

### Ownership de pruebas

| Rol | Responsabilidad |
|---|---|
| `frontend-builder` / `backend-builder` | Código de producto y seams de testabilidad. No crean ni ejecutan pruebas. |
| `frontend-auditor` / `backend-auditor` | Solo lectura. No crean pruebas ni correcciones. |
| `unit-test-runner` | Pruebas unitarias aisladas y contract-unit. |
| `integration-test-runner` | Pruebas sin navegador entre componentes reales. |
| `e2e-test-runner` | Journeys Playwright en navegador real. |
| `performance-test-runner` | Pruebas de aceptación, regresión, carga, stress, spike y soak. |

---

## 📈 Estado actual y hoja de ruta

**Estado actual del proyecto:**

- ✅ Especificación funcional completa (`specs/001-compare-llm-responses/spec.md`).
- ✅ Modelo de datos definido (`data-model.md`).
- ✅ 118+ tareas de implementación identificadas, priorizadas y con dependencias.
- 🔄 Fases de ejecución: US1 (setup) → US2 (workspace multiturno + SSE) → US3 (historial + reapertura) → US4 (comparación lateral + recovery).

**Extensiones naturales previstas:**

- Soporte para más proveedores y modelos.
- Configuración dinámica de modelos desde la UI.
- Evaluación automática de respuestas (scoring / ranking).
- Métricas de costo y tokens por conversación.
- Exportación de conversaciones.
- Herramientas avanzadas de investigación y escritura asistida.

---

## 🤝 Contribuir

1. Leer `specs/001-compare-llm-responses/spec.md` para contexto funcional completo.
2. Revisar `tasks.md` para tareas pendientes y sus dependencias.
3. Seguir la convención de commits: `feat:`, `fix:`, `test:`, `docs:`.
4. Los PRs requieren: tests passing, cobertura > 80%, y revisión de al menos 1 maintainer.

---

## 📄 Licencia

MIT.

---

_**ModelFuse** — Comparación y fusión de LLMs con trazabilidad, resiliencia y reproducibilidad._
