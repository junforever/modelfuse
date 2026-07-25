# Phase 0 Research: ModelFuse

## Decision 1: Monolito modular dentro del monorepo actual

**Decision**: Mantener `apps/frontend`, `apps/backend`, `packages/ui` y `db` como
únicos límites principales.

**Rationale**: El producto es una sola aplicación privada y sus módulos comparten
un ciclo de despliegue. Los límites existentes ya separan presentación,
orquestación, UI reutilizable y esquema.

**Alternatives considered**: Microservicios por proveedor o un workspace de
contratos. Ambos agregan despliegues y coordinación sin un segundo consumidor o
escala que los justifique.

## Decision 2: REST asíncrono con polling

**Decision**: Las escrituras de turno devuelven `202`; el frontend consulta el
estado del turno hasta que sus cuatro slots sean terminales.

**Rationale**: Evita mantener una solicitud durante llamadas LLM lentas, permite
mostrar estados independientes y usa Express/Axios ya instalados.

**Alternatives considered**: SSE y WebSockets, descartados porque no se exige
streaming; una cola externa, diferida hasta requerir multiinstancia o ejecución
durable.

## Decision 3: Routers Express por módulo y error global

**Decision**: Montar un router de conversaciones desde `app.ts`, mantener
controllers delgados y finalizar con middleware de ruta inválida y error global.

**Rationale**: Express 5 soporta routers como stacks aislados y propaga rechazos de
handlers async al error handler. `createApp()` permanece testeable sin `listen`.

**Alternatives considered**: Un archivo de rutas único o lógica de negocio dentro
de handlers; ambos rompen límites y dificultan pruebas.

**Source**: Documentación oficial de
[Express routing and middleware](https://github.com/expressjs/express/blob/master/_autodocs/07-middleware-and-routing.md).

## Decision 4: Un agregado con cuatro slots normalizados

**Decision**: Guardar un prompt por turno y cuatro filas `model_responses`
identificadas por slot.

**Rationale**: Evita duplicar prompts, permite estados/retries independientes y
reconstruye cada historial por slot con consultas simples.

**Alternatives considered**: Cuatro conversaciones físicas, que duplicarían
identidad y complicarían rename/delete; columnas de respuesta en `turns`, que
harían rígidos estados y métricas.

## Decision 5: Adapter LLM mínimo y real

**Decision**: Un único contrato `LlmProvider.generate()` con registry por slot y
respuesta normalizada.

**Rationale**: Existen varios proveedores reales, por lo que la abstracción no es
especulativa. Orquestación y UI quedan libres de payloads concretos.

**Alternatives considered**: Condicionales por proveedor dentro del orchestrator,
descartados por acoplamiento; una jerarquía de factories, descartada por
innecesaria.

## Decision 6: Ventana acotada antes que resúmenes automáticos

**Decision**: Incluir como máximo los últimos 10 turnos que quepan en el
presupuesto configurado por modelo.

**Rationale**: Controla costo desde el primer día sin agregar llamadas de resumen
ni otra tabla. Se registra cuándo hubo truncamiento.

**Alternatives considered**: Historial completo, incompatible con límites y costo;
resumen en cada turno, descartado por latencia/costo. Un resumen persistido se
añadirá solo si las métricas de truncamiento y calidad lo justifican.

## Decision 7: TanStack Query v5 para todo el server state

**Decision**: Añadir `@tanstack/react-query` v5. Listas e historial usan
`useInfiniteQuery`; metadatos y polling usan `useQuery`; todas las escrituras usan
`useMutation`. Solo selección, dialogs, tabs y drafts permanecen en estado React.

**Rationale**: El spec ahora exige cache por conversación, historial incremental,
polling, invalidación y múltiples mutaciones. TanStack Query resuelve esas
responsabilidades con una única fuente de server state y permite detener polling
mediante `refetchInterval` cuando el turno es terminal.

**Alternatives considered**: Hooks manuales, descartados porque duplicarían cache,
cancelación e invalidación; store global, descartado porque no sincroniza server
state por sí mismo.

**Source**: Documentación oficial de TanStack Query sobre
[infinite queries](https://github.com/tanstack/query/blob/v5.90.3/docs/framework/react/reference/useInfiniteQuery.md),
[query keys](https://github.com/tanstack/query/blob/v5.90.3/docs/framework/react/guides/query-keys.md)
y `refetchInterval`.

## Decision 7.1: Cursor anterior y cache de una conversación activa

**Decision**: El endpoint devuelve bloques cronológicos de tres turnos y un cursor
opaco hacia turnos anteriores. `useInfiniteQuery` usa
`getPreviousPageParam`/`fetchPreviousPage`.

**Rationale**: La unidad permanece como turno completo y el usuario navega con
scroll ascendente. No se usa `maxPages` inicialmente: podría expulsar el tramo
reciente; en su lugar, `gcTime` y `removeQueries` limpian historiales inactivos.

**Alternatives considered**: Offset, vulnerable a inserciones; botones de página,
prohibidos por el spec; cache ilimitado entre conversaciones, innecesario.

## Decision 8: Primitives Shadcn centralizados

**Decision**: Añadir únicamente primitives faltantes a `packages/ui` y componer
features en `apps/frontend`.

**Rationale**: La guía oficial de monorepo usa un paquete UI con exports por
componentes y aliases desde la aplicación; coincide con la configuración actual.

**Alternatives considered**: Copiar dialogs/tabs a frontend o mover componentes
de conversación al paquete UI; ambos rompen reutilización o agnosticismo.

**Source**: Guía oficial de
[Shadcn UI monorepo](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/(root)/monorepo.mdx).

## Decision 9: SQL formateado y XML de módulo

**Decision**: Crear módulos `conversations` y `messages`, incluidos explícitamente
desde el changelog master.

**Rationale**: Liquibase identifica cada cambio por changeset y permite rollback
de SQL formateado; la división refleja ownership real.

**Alternatives considered**: Un SQL monolítico o cambios manuales, prohibidos por
la constitución; un módulo vacío de métricas, descartado hasta que exista esquema
analítico.

**Source**: Documentación oficial de
[Liquibase formatted SQL](https://github.com/liquibase/liquibase-docs/blob/master/Content/concepts/changelogs/sql-format.html).

## Decision 10: Observabilidad por correlación, sin tracing distribuido

**Decision**: Logs Pino estructurados y usage persistido, correlacionados por
request/conversation/turn/slot.

**Rationale**: Es suficiente para un monolito de una instancia y deja datos para
diagnosticar proveedores y costo.

**Alternatives considered**: OpenTelemetry desde el inicio, diferido hasta que
existan múltiples procesos o necesidad demostrada de trazas distribuidas.

## Resolved Unknowns

No quedan decisiones abiertas. Las versiones base se tomaron de los manifiestos;
TanStack Query v5 es la única dependencia nueva requerida por esta revisión.
