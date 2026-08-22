<!-- SPECKIT START -->

Para contexto adicional sobre tecnologías, estructura del proyecto, comandos y demás
información relevante, usa como fuentes autoritativas:
`.specify/memory/constitution.md` y
`specs/002-configurable-provider-deployments/plan.md`.

- El agente principal/coordinador debe leer ambos documentos completos una sola vez, antes de la primera delegación de cada bloque de implementación, y conservar un resumen verificable de sus secciones aplicables.
- Tras esa lectura inicial, el coordinador y los subagentes deben localizar encabezados con búsqueda y leer únicamente los rangos que correspondan a la tarea. Una nueva lectura completa solo se permite cuando uno de esos documentos cambió desde la lectura inicial o una instrucción explícita exige el documento completo.
- Los subagentes NO deben cargar ambos documentos completos por defecto. Cada delegación debe indicar las rutas y los encabezados o rangos que debe consultar.

<!-- SPECKIT END -->

## Preflight universal de runtime y comandos

- Antes de cada bloque de implementación o validación, el agente principal/coordinador debe ejecutar `.\agent-scripts\initialize-runtime.ps1` desde la raíz del repositorio y detener el bloque si el comando devuelve un error.
- La inicialización es idempotente: si `agent-scripts\runtime.local.json` contiene rutas y versiones válidas, termina sin reconfigurar el runtime. Si el runtime cambió, usar `-Force`.
- Si la inicialización falla porque no existe la versión exacta requerida, el coordinador debe clasificarlo como `BLOQUEO_RUNTIME` externo y detener inmediatamente delegaciones, implementaciones y validaciones. Si el error ya informa las candidatas inspeccionadas, no hace falta otro comando; de lo contrario, solo puede realizar una comprobación diagnóstica inmediata para confirmar esas rutas y versiones. No debe instalar, descargar, activar ni reparar runtimes, modificar `PATH`, repetir el inicializador ni esperar a que el entorno cambie.
- Ante ese bloqueo, la respuesta del coordinador debe conservar exactamente esta estructura, sustituyendo los valores observados:
  ```text
  BLOQUEO_RUNTIME
  Requerido: pnpm <versión exacta de package.json>
  Disponible: <versión(es) encontrada(s) o "no encontrado">
  No se delegarán tareas ni se modificarán archivos.
  Acción requerida: provisionar pnpm <versión exacta> en el runtime aprobado y repetir el preflight.
  ```
- Los subagentes no deben resolver otra instalación de Node/pnpm ni modificar `PATH`. Todo comando Node/pnpm debe ejecutarse mediante `.\agent-scripts\run-pnpm.ps1`; si el wrapper falla, deben reportar el bloqueo y detenerse.
- El archivo `agent-scripts\runtime.local.json` es local, no contiene secretos y está excluido de Git. No se debe agregar a documentación de la feature.

## Delegación obligatoria de tareas de Spec Kit

Para toda ejecución de implementación basada en un archivo `tasks.md`:

- Respeta el owner declarado para cada tarea y delégala al custom sub-agent correspondiente definido en `.codex/agents`:
  - `FE` -> `frontend-builder`
  - `UI` -> `frontend-builder`
  - `BE` -> `backend-builder`
  - `DB` -> `backend-builder`
  - `UNIT` -> `unit-test-runner`
  - `INTEGRATION` -> `integration-test-runner`
  - `E2E` -> `e2e-test-runner`
  - `PERF` -> `performance-test-runner`
  - `UX` -> `product-designer`
- Delega toda tarea de product code y tests a su owner declarado, respetando dependencias y orden de ejecución de `tasks.md`.
- El agente principal actúa sólo como coordinador: puede inspeccionar contexto, delegar, seguir progreso, revisar evidencia y reportar resultados, pero no debe implementar ni modificar directamente product code o tests.
- Si el agente owner requerido no existe o no está disponible, detén el trabajo afectado y reporta el bloqueo. No implementes la tarea directamente ni la reasignes a otro owner.

## Reglas obligatorias de eficiencia de tokens

Estas reglas priorizan reducir contexto innecesario, trabajo duplicado, waits repetitivos, validaciones redundantes y reactivaciones evitables.

### Contexto de subagentes

- Al crear un subagente, usa `fork_turns=none` por defecto.
- Usa `fork_turns=all` únicamente cuando la tarea dependa de contexto previo del agente principal que no pueda reconstruirse de forma segura y eficiente desde `tasks.md`, specs, plan, constitution o archivos concretos del repositorio.
- Si se usa `fork_turns=all`, debe existir una razón concreta relacionada con la tarea; no lo uses por comodidad.
- Cada delegación debe ser autocontenida y mínima: incluye sólo task ID(s), objetivo, acceptance criteria relevantes, dependencias y paths/secciones concretas necesarias. No copies la conversación completa, documentos completos ni contexto no relacionado.
- Los subagentes deben preferir búsquedas y lecturas dirigidas. No recorrer todo el repositorio, leer documentación completa ni abrir archivos no relacionados “por si acaso”.

### Número de delegaciones y trabajo duplicado

- Cuando varias tareas listas tengan el mismo owner, afecten el mismo contexto/área y no exista una dependencia que requiera validación intermedia, agrúpalas en una sola delegación para reutilizar contexto.
- No crees múltiples instancias del mismo owner para tareas que modifican los mismos archivos o tienen scope superpuesto salvo que el paralelismo sea explícitamente necesario y seguro.
- Paraleliza sólo tareas realmente independientes. No lances un subagente si tendrá que esperar a que otro complete una dependencia.
- No asignes el mismo trabajo a dos agentes salvo que `tasks.md` exija explícitamente una revisión/auditoría independiente. Un auditor/reviewer debe revisar evidencia/diff; no reimplementar el trabajo del builder.
- No delegues exploración especulativa ni trabajo futuro que no sea necesario para las tareas actualmente desbloqueadas.

### Validación y comandos

- Antes de la primera validación JavaScript/TypeScript de un bloque de implementación, el coordinador debe haber ejecutado `.\agent-scripts\initialize-runtime.ps1` sin error y comunicar al owner el comando completo usando `.\agent-scripts\run-pnpm.ps1`. Ese runtime se reutiliza en todas las validaciones del bloque.
- Toda prueba Vitest focalizada debe ejecutarse desde la raíz mediante el script declarado por el workspace y el wrapper: `.\agent-scripts\run-pnpm.ps1 --filter <workspace> run test --run <ruta-relativa-del-test>`. No se usa `pnpm exec vitest` ni se invoca `vitest` directamente.
- Antes de añadir una aserción sobre el DOM emitido por una dependencia externa, el owner de test debe comprobar ese DOM en la versión instalada. Si el atributo no está garantizado, la prueba debe usar un resultado observable estable del componente; no debe asumir atributos internos de la dependencia.
- El owner de una tarea debe ejecutar la validación mínima y suficiente para demostrar sus acceptance criteria.
- Prefiere tests/typecheck/lint/build focalizados al área modificada antes de ejecutar suites globales.
- No repitas exactamente la misma validación si no hubo cambios de código, configuración o estado que puedan alterar el resultado.
- El coordinador no debe volver a ejecutar una validación que el owner ya reportó como exitosa, salvo que exista una integración cross-task que requiera una comprobación adicional.
- Las validaciones globales/cross-task deben ejecutarse una sola vez en el boundary apropiado y delegarse al owner de testing correspondiente cuando `tasks.md` lo requiera.
- Tras una validación fallida, el owner debe registrar el primer error relevante y clasificarlo como defecto de producto, defecto de test, defecto de comando/runtime o bloqueo externo. El siguiente comando solo puede cambiar el elemento que corrige esa clasificación. No se permiten reintentos por variaciones de sintaxis, binario o directorio sin un diagnóstico que los justifique.
- Evita outputs masivos: usa comandos focalizados, filtros y extractos relevantes. No devuelvas logs completos cuando basten el error, resumen y evidencia necesaria.
- Antes de solicitar una validación, el coordinador debe consultar la evidencia ya reportada por el owner y el estado de los archivos desde esa ejecución. Una validación exitosa del owner, incluido `git diff --check`, es evidencia suficiente para el coordinador salvo que haya cambios posteriores en los archivos validados, falte evidencia verificable o una integración cross-task exija una comprobación distinta. Revisar un diff para entenderlo no autoriza a repetir su validación.

### Espera, seguimiento y followups

- Evita patrones de polling como `wait → list/status → wait → list/status`.
- Después de delegar, continúa con otras tareas independientes. Espera/consulta estado sólo cuando una dependencia real impida continuar.
- Para una misma dependencia, realiza una espera/comprobación razonable y reutiliza el resultado; no hagas checks repetidos sin nueva evidencia.
- Antes de esperar, identifica la condición concreta que desbloquea el siguiente paso. Por cada dependencia, realiza como máximo dos esperas de hasta 60 segundos sin recibir mensaje del subagente. Tras el segundo timeout, envía un único followup solicitando estado, bloqueo o ETA y no vuelve a esperar hasta recibir su respuesta, una actualización del usuario o un resultado final. Consulta `list/status` únicamente para recibir un resultado final, atender un blocker explícito, decidir una interrupción o cumplir la verificación final de apagado.
- Cuando un subagente ya envió su resultado final, no vuelvas a esperarlo ni pidas confirmaciones redundantes.
- Formula la delegación inicial con suficiente alcance y acceptance criteria para minimizar followups.
- Reactiva/envía followup a un agente únicamente por blocker concreto, acceptance criterion fallido, evidencia faltante o nuevo trabajo necesario. No lo reactives sólo para volver a explicar, resumir o confirmar trabajo ya terminado.

### Control del crecimiento de contexto

- No pegues archivos completos, diffs completos, logs extensos o resultados de tests extensos en mensajes inter-agent si basta con indicar paths, líneas relevantes o un resumen verificable.
- Reutiliza evidencia ya obtenida. No vuelvas a leer o recalcular información estable salvo que una modificación posterior la invalide.
- Si una tarea puede resolverse usando archivos autoritativos del repositorio, referencia esos archivos en lugar de heredar el contexto completo del agente principal.
- Para documentos extensos, primero lista sus encabezados y localiza los términos de la tarea; después lee únicamente los rangos resultantes. Cuando una instrucción exige lectura completa, léelo por separado y en fragmentos continuables hasta EOF. Si una lectura se trunca, registra la última línea confirmada: la siguiente lectura debe comenzar en la primera línea posterior a esa línea y nunca desde el inicio. Solo si no existe una última línea confirmada con número de línea exacto se permite reiniciar la lectura completa. No combines varios documentos largos en una misma salida. Conserva y reutiliza un resumen verificable de las secciones ya leídas.
- Una tarea se considera terminada cuando cumple sus acceptance criteria y aporta evidencia suficiente. No añadas validaciones, refactors o exploraciones no solicitadas después de ese punto.

### Contrato de respuesta de subagentes

- La respuesta final de un subagente debe ser breve y orientada a evidencia. Incluye únicamente:
  - task ID(s) completados;
  - archivos modificados;
  - validaciones ejecutadas y resultado;
  - decisiones relevantes no evidentes;
  - blockers o trabajo pendiente real.
- No incluyas narrativa extensa, repetición de la especificación ni dumps completos de comandos/logs salvo que sean necesarios para explicar un fallo.

## Verificación obligatoria de apagado de subagentes

- Al final de cada ejecución de implementación, consulta una sola vez el estado final de todos los subagentes delegados antes de responder.
- Si algún subagente continúa `running`, interrúmpelo y verifica que ya no esté ejecutándose.
- No trates un subagente como activo sólo porque siga listado en el task tree con estado `completed`; únicamente los agentes `running` requieren shutdown.
- Reporta el resultado final del check, incluyendo cualquier agente interrumpido o blocker externo que haya impedido confirmar el shutdown.
