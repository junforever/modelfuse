# AI Fullstack Basic Template (Monorepo)

Este es un template base (monorepo) diseñado específicamente para ser operado y expandido por Agentes de IA. Está configurado con pnpm workspaces, Vite, React, Express y Shadcn UI.

## 📂 Estructura del Proyecto

El monorepo está dividido en aplicaciones (`apps/`) y paquetes compartidos (`packages/`).

- **`apps/frontend/`**: Aplicación web principal (React + Vite).
- **`apps/backend/`**: Servidor API principal (Node.js + Express + TypeScript).
- **`packages/ui/`**: Librería de componentes visuales compartidos (Shadcn UI + Tailwind CSS).

### ⚙️ Arquitectura del Backend (`apps/backend/src`)

El backend sigue una arquitectura limpia orientada a responsabilidades. Todo el código nuevo debe respetar esta organización:

- **`app.ts` vs `index.ts`**: El archivo `index.ts` tiene la **única y exclusiva responsabilidad** de levantar el servidor (puerto y graceful shutdowns). Toda configuración de la aplicación Express, middlewares globales y montado de rutas principales debe hacerse dentro de **`app.ts`**.
- **`controllers/`**: Maneja las peticiones HTTP (req/res), extrae los parámetros, ejecuta la lógica de negocio y retorna la respuesta al cliente.
- **`routes/`**: Define las rutas/endpoints de Express y los enlaza con sus respectivos controladores.
- **`middleware/`**: Lógica intermedia de Express (autenticación, validación de schemas con Zod, manejo centralizado de errores, etc.).
- **`infrastructure/`**: Conexiones a bases de datos (ej. PostgreSQL), integraciones con APIs externas y configuración de servicios de terceros.
- **`utils/`**: Funciones de apoyo, utilidades puras y helpers genéricos.
- **`types/`**: Declaraciones de tipos e interfaces globales de TypeScript.

---

## 🤖 Instrucciones para Agentes de IA (AI Agents)

Si eres un agente de IA (como yo) trabajando en este repositorio, **debes seguir estas reglas estrictamente**:

1. **Gestión de Componentes UI (Shadcn)**:
   - **Cómo saber qué está instalado**: Para saber qué componentes de Shadcn UI existen en el proyecto, DEBES usar siempre la herramienta `list_dir` (o equivalente) para explorar el directorio `packages/ui/src/components`.

2. **Instalación de Nuevos Componentes UI**:
   - Si el usuario te pide una interfaz que requiere un componente de Shadcn que no está instalado, añádelo ejecutando:
     ```bash
     pnpm dlx shadcn@latest add <nombre-componente> -c apps/frontend
     ```
   - _Nota: Aunque se ejecuta con `-c apps/frontend`, el componente se instalará correctamente en `packages/ui/src/components` gracias a la configuración del archivo `components.json`._

3. **Uso de Componentes UI**:
   - Todos los componentes gráficos en el frontend deben ser importados desde el paquete compartido utilizando el alias:
     ```tsx
     import { Button } from '@workspace/ui/components/button';
     ```
   - Nunca introduzcas dependencias específicas de una aplicación (como el router del frontend) dentro del código de `packages/ui`. La UI debe ser 100% agnóstica.

4. **Gestión de Base de Datos y Migraciones (Liquibase)**:
   - Toda creación o modificación de base de datos (tablas, RLS, store procedures, triggers, views) DEBE hacerse mediante scripts SQL formateados para Liquibase (`-- liquibase formatted sql`).
   - Dado que seguimos una arquitectura de **Monolito Modular**, las migraciones deben organizarse en subcarpetas por módulo dentro de `db/changelogs/` (ej. `db/changelogs/modulo_usuarios/001-init.sql`).
   - El agente debe ser proactivo en crear estas carpetas de módulo cuando sea necesario.
   - Todo nuevo changelog de módulo debe incluirse en su respectivo `db.changelog-<modulo>.xml`, el cual a su vez debe ser importado (include) en `db/changelogs/db.changelog-master.xml`.
