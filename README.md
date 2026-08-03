# ModelFuse (Monorepo)

ModelFuse es una aplicación web para comparar, persistir y fusionar respuestas de múltiples modelos LLM dentro de una misma conversación.

La idea central del proyecto es permitir que el usuario escriba un prompt una sola vez y reciba, en paralelo, respuestas de varios modelos distintos. Luego, un cuarto modelo actúa como integrador: analiza las respuestas anteriores, toma sus mejores partes, añade lo que falte y genera una respuesta final más completa, útil y refinada.

Este proyecto está diseñado como un **monorepo** orientado a escalabilidad, mantenimiento claro y colaboración asistida por agentes de IA. Está configurado con **pnpm workspaces, Vite, React, Express, TypeScript y Shadcn UI**.

---

## 🚀 Qué hace ModelFuse

La aplicación permite:

- Escribir un prompt desde una interfaz principal tipo chat.
- Enviar ese prompt a **tres modelos LLM** distintos en paralelo.
- Mostrar cada respuesta en su propio tab de conversación.
- Mostrar un **cuarto tab integrador**, donde un cuarto modelo genera una respuesta consolidada usando lo mejor de las tres respuestas previas y complementándolas con información adicional.
- Mantener conversaciones de múltiples turnos, no solo interacciones aisladas.
- Guardar el historial de conversaciones en **PostgreSQL**.
- Recuperar conversaciones guardadas desde una barra lateral izquierda.
- Limpiar la conversación actual para iniciar una nueva.
- Cargar las API keys y configuraciones sensibles desde variables de entorno (`.env`).

---

## 🎯 Objetivo del proyecto

ModelFuse busca resolver un problema muy común al trabajar con LLMs: una sola respuesta rara vez es suficiente cuando se busca calidad, cobertura o contraste entre enfoques.

En lugar de depender de un único modelo, la aplicación permite:

- comparar respuestas lado a lado,
- iterar sobre una conversación,
- conservar el historial,
- y obtener una respuesta final enriquecida mediante un modelo integrador.

Esto convierte a ModelFuse en una herramienta útil para investigación, redacción, ideación, validación técnica y workflows avanzados de prompting.

---

## 📂 Estructura del Proyecto

El monorepo está dividido en aplicaciones (`apps/`) y paquetes compartidos (`packages/`).

- **`apps/frontend/`**: Aplicación web principal (React + Vite).
- **`apps/backend/`**: Servidor API principal (Node.js + Express + TypeScript).
- **`packages/ui/`**: Librería de componentes visuales compartidos (Shadcn UI + Tailwind CSS).

---

## 🧩 Responsabilidades por capa

### `apps/frontend/`
Responsable de la experiencia de usuario y del flujo conversacional. Aquí vive la interfaz principal del producto:

- área de entrada del prompt,
- tabs de respuestas por modelo,
- tab de respuesta integradora,
- sidebar de conversaciones guardadas,
- navegación entre conversaciones,
- acciones como continuar conversación o limpiar sesión actual.

### `apps/backend/`
Responsable de la orquestación del sistema:

- recepción de prompts,
- envío a múltiples proveedores/modelos,
- lógica de combinación para el modelo integrador,
- persistencia de conversaciones,
- lectura de variables de entorno,
- y exposición de endpoints para frontend.

### `packages/ui/`
Responsable de los componentes visuales compartidos y reutilizables del sistema de diseño. Debe mantenerse desacoplado de la lógica de negocio y de cualquier dependencia específica de una aplicación.

---

## ⚙️ Arquitectura del Backend (`apps/backend/src`)

El backend sigue una arquitectura limpia orientada a responsabilidades. Todo el código nuevo debe respetar esta organización:

- **`app.ts` vs `index.ts`**: El archivo `index.ts` tiene la **única y exclusiva responsabilidad** de levantar el servidor (puerto y graceful shutdowns). Toda configuración de la aplicación Express, middlewares globales y montado de rutas principales debe hacerse dentro de **`app.ts`**.
- **`controllers/`**: Maneja las peticiones HTTP (`req/res`), extrae parámetros, invoca la lógica necesaria y retorna respuestas al cliente.
- **`routes/`**: Define los endpoints de Express y los enlaza con sus respectivos controladores.
- **`middleware/`**: Lógica intermedia de Express, como autenticación, validación con Zod, manejo centralizado de errores, logging, etc.
- **`infrastructure/`**: Conexiones a PostgreSQL, acceso a variables de entorno, clientes para APIs de modelos LLM y servicios externos.
- **`utils/`**: Funciones de apoyo, utilidades puras y helpers genéricos.
- **`types/`**: Declaraciones globales de tipos e interfaces TypeScript.

---

## 🧠 Flujo funcional esperado

A nivel de producto, el flujo principal de ModelFuse es el siguiente:

1. El usuario escribe un prompt en el área principal de chat.
2. El sistema envía ese prompt a tres modelos distintos; cada modelo recibe solo
   su propio historial individual.
3. Cada modelo responde en su tab correspondiente.
4. El sistema pasa esas tres respuestas nuevas a un cuarto modelo integrador,
   junto con el historial consolidado propio de este último, pero sin los
   historiales completos de los otros modelos.
5. El cuarto modelo genera una respuesta unificada y enriquecida.
6. La conversación queda persistida para continuar iterando después.
7. El usuario puede reabrir conversaciones guardadas desde la barra lateral o limpiar la actual para comenzar una nueva.

---

## 🔐 Configuración y entorno

Las credenciales de los modelos y demás variables sensibles deben cargarse desde un archivo `.env`.

Ejemplos de responsabilidades de configuración:

- API keys de proveedores LLM.
- URL de conexión a PostgreSQL.
- Configuración del servidor backend.
- Flags o parámetros de ejecución por entorno.

**Importante:** nunca hardcodear secretos en el código fuente.

---

## 🤖 Instrucciones para Agentes de IA (AI Agents)

Si eres un agente de IA trabajando en este repositorio, **debes seguir estas reglas estrictamente**:

La [constitución del proyecto](.specify/memory/constitution.md) es la autoridad
principal. Estas instrucciones operativas deben interpretarse dentro de sus
límites.

### 1. Gestión de Componentes UI (Shadcn)
- **Cómo saber qué está instalado**: Para saber qué componentes de Shadcn UI existen en el proyecto, DEBES usar siempre la herramienta `list_dir` (o equivalente) para explorar el directorio `packages/ui/src/components`.

### 2. Instalación de Nuevos Componentes UI
- Si el usuario te pide una interfaz que requiere un componente de Shadcn que no está instalado, añádelo ejecutando:

```bash
pnpm dlx shadcn@latest add <nombre-componente> -c apps/frontend
```

- **Nota**: Aunque se ejecuta con `-c apps/frontend`, el componente se instalará correctamente en `packages/ui/src/components` gracias a la configuración del archivo `components.json`.

### 3. Uso de Componentes UI
- Todos los componentes gráficos en el frontend deben ser importados desde el paquete compartido utilizando el alias:

```tsx
import { Button } from '@workspace/ui/components/button';
```

- Nunca introduzcas dependencias específicas de una aplicación (como el router del frontend) dentro del código de `packages/ui`. La UI debe ser **100% agnóstica**.

### 4. Gestión de Base de Datos y Migraciones (Liquibase)
- Toda creación o modificación de base de datos (tablas, RLS, store procedures, triggers, views) DEBE hacerse mediante scripts SQL formateados para Liquibase (`-- liquibase formatted sql`).
- Dado que seguimos una arquitectura de **Monolito Modular**, las migraciones deben organizarse en subcarpetas por módulo dentro de `db/changelogs/` (ej. `db/changelogs/modulo_usuarios/001-init.sql`).
- El agente debe ser proactivo en crear estas carpetas de módulo cuando sea necesario.
- Todo nuevo changelog de módulo debe incluirse en su respectivo `db.changelog-<modulo>.xml`, el cual a su vez debe ser importado (include) en `db/changelogs/db.changelog-master.xml`.

### 5. Nuevas features
Cuando implementes nuevas funcionalidades, mantén separadas estas responsabilidades:

- UI y estado visual en frontend.
- Orquestación de modelos y persistencia en backend.
- Componentes reutilizables en `packages/ui`.
- Integraciones externas dentro de `infrastructure/`.

### 6. Integraciones con LLMs
Toda integración con modelos externos debe diseñarse para ser:

- configurable por `.env`,
- desacoplada del proveedor,
- extensible para nuevos modelos,
- y reutilizable para flujos futuros de comparación, evaluación o fusión de respuestas.

### 7. Ownership de pruebas

- `frontend-builder` y `backend-builder` implementan únicamente código de
  producto y seams de testabilidad; no crean, modifican ni ejecutan pruebas.
- `frontend-auditor` y `backend-auditor` permanecen read-only y no crean pruebas
  ni correcciones.
- `unit-test-runner` posee pruebas unitarias aisladas y contract-unit.
- `integration-test-runner` posee pruebas sin navegador entre componentes reales.
- `e2e-test-runner` posee journeys Playwright en navegador real.
- Rendimiento, seguridad, visual u otra disciplina fuera de esos tres niveles
  requiere un owner especializado explícito.

---

## 📌 Principios del proyecto

Las decisiones de implementación dentro de ModelFuse DEBEN alinearse con estos principios:

- **Separación clara de responsabilidades**.
- **Escalabilidad para agregar más modelos o estrategias de fusión**.
- **Persistencia conversacional real**, no solo prompts sueltos.
- **UI consistente y reutilizable**.
- **Configuración sensible fuera del código**.
- **Código comprensible tanto para humanos como para agentes de IA**.

---

## 🛠️ Stack base

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **UI**: Shadcn UI + Tailwind CSS
- **Monorepo**: pnpm workspaces
- **Base de datos**: PostgreSQL
- **Migraciones**: Liquibase

---

## 📈 Evolución esperada

ModelFuse está planteado para crecer sobre esta base. Algunas extensiones naturales del proyecto podrían incluir:

- soporte para más proveedores y modelos,
- configuración dinámica de modelos desde UI,
- evaluación automática de respuestas,
- scoring o ranking por respuesta,
- métricas de costo/tokens,
- exportación de conversaciones,
- y herramientas avanzadas de investigación o escritura asistida.
