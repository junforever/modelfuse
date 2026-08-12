<!-- SPECKIT START -->

Para contexto adicional sobre tecnologías, estructura del proyecto, comandos y demás
información relevante, usa como fuentes autoritativas:
`.specify/memory/constitution.md` y
`specs/001-compare-llm-responses/plan.md`.

- El agente principal/coordinador debe revisar estas fuentes al inicio del bloque de implementación.
- Los subagentes NO deben volver a cargar ambos documentos completos por defecto. Deben leer sólo las secciones necesarias para sus tareas, usando búsquedas/lecturas dirigidas. Sólo pueden leerlos completos cuando la tarea realmente lo requiera.

<!-- SPECKIT END -->

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

- El owner de una tarea debe ejecutar la validación mínima y suficiente para demostrar sus acceptance criteria.
- Prefiere tests/typecheck/lint/build focalizados al área modificada antes de ejecutar suites globales.
- No repitas exactamente la misma validación si no hubo cambios de código, configuración o estado que puedan alterar el resultado.
- El coordinador no debe volver a ejecutar una validación que el owner ya reportó como exitosa, salvo que exista una integración cross-task que requiera una comprobación adicional.
- Las validaciones globales/cross-task deben ejecutarse una sola vez en el boundary apropiado y delegarse al owner de testing correspondiente cuando `tasks.md` lo requiera.
- No repitas un comando fallido idéntico más de una vez sin un cambio concreto que pueda corregir la causa. Si el mismo root cause persiste, diagnostica/cambia de estrategia o reporta el blocker.
- Evita outputs masivos: usa comandos focalizados, filtros y extractos relevantes. No devuelvas logs completos cuando basten el error, resumen y evidencia necesaria.

### Espera, seguimiento y followups

- Evita patrones de polling como `wait → list/status → wait → list/status`.
- Después de delegar, continúa con otras tareas independientes. Espera/consulta estado sólo cuando una dependencia real impida continuar.
- Para una misma dependencia, realiza una espera/comprobación razonable y reutiliza el resultado; no hagas checks repetidos sin nueva evidencia.
- Cuando un subagente ya envió su resultado final, no vuelvas a esperarlo ni pidas confirmaciones redundantes.
- Formula la delegación inicial con suficiente alcance y acceptance criteria para minimizar followups.
- Reactiva/envía followup a un agente únicamente por blocker concreto, acceptance criterion fallido, evidencia faltante o nuevo trabajo necesario. No lo reactives sólo para volver a explicar, resumir o confirmar trabajo ya terminado.

### Control del crecimiento de contexto

- No pegues archivos completos, diffs completos, logs extensos o resultados de tests extensos en mensajes inter-agent si basta con indicar paths, líneas relevantes o un resumen verificable.
- Reutiliza evidencia ya obtenida. No vuelvas a leer o recalcular información estable salvo que una modificación posterior la invalide.
- Si una tarea puede resolverse usando archivos autoritativos del repositorio, referencia esos archivos en lugar de heredar el contexto completo del agente principal.
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
