<!-- SPECKIT START -->

Para contexto adicional sobre tecnologías, estructura del proyecto, comandos y demás información relevante, usa como fuentes autoritativas: `.specify/memory/constitution.md` y `specs/002-configurable-provider-deployments/plan.md`.

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
- Los subagentes no deben resolver otra instalación de Node/pnpm ni modificar `PATH`. Todo comando Node/pnpm debe ejecutarse mediante `.\agent-scripts\run-pnpm.ps1`; si el comando necesita variables de integración, puede pasar `-EnvFile apps/backend/.env.integration` al mismo wrapper. Si el wrapper falla, deben reportar el bloqueo y detenerse.
- El owner de la tarea selecciona y ejecuta las validaciones; el coordinador no anticipa ni ejecuta comandos por su cuenta. Los scripts declarados en el `package.json` del workspace son el camino preferido, pero no una lista cerrada. Si el comando requiere argumentos que PowerShell pueda interpretar como parámetros del wrapper, el owner debe usar el protocolo pass-through del wrapper: `.\agent-scripts\run-pnpm.ps1 [opciones del wrapper] -- [argumentos literales de pnpm]`. La frontera del wrapper se declara una sola vez; cualquier `--` posterior pertenece al comando literal y se conserva.
- Una variante puntual que no esté representada por un script puede proponerse mediante el protocolo pass-through sin crear un script permanente. Antes de ejecutarla, el owner debe entregar al coordinador el comando exacto, el comando base, la diferencia, el propósito, el alcance y el máximo de ejecuciones; el coordinador solicita aprobación explícita en la ventana. La aprobación autoriza únicamente ese comando y esa cantidad de ejecuciones. Una negativa cancela el bloque y requiere nuevas instrucciones; la ausencia de respuesta pausa el bloque sin polling ni reintentos. Si el wrapper no soporta el protocolo requerido o falta el script necesario, se clasifica el bloqueo, no se improvisan variantes y se detiene la ejecución informando lo sucedido.
- El coordinador solo debe ejecutar un preflight de Docker cuando el bloque actual lo requiera de forma explícita: una tarea o su comando debe usar Docker/Compose, PostgreSQL/Liquibase desechable, Testcontainers, un contenedor de aplicación/base de datos, o una dependencia de servicio cuya disponibilidad se compruebe mediante Docker. No debe comprobar Docker ni iniciar servicios para tareas de unit, frontend/UI, build, typecheck, lint o integraciones que mockeen toda la infraestructura.
- Cuando Docker sea necesario, después del preflight de runtime el coordinador debe ejecutar `.\agent-scripts\preflight-integration.ps1` para un target PostgreSQL/Liquibase de integración, pasando `-EnvFile <archivo local>` cuando las variables del target no estén ya en el entorno, o el preflight equivalente del repositorio para otro tipo de servicio. El script debe comprobar Docker, Compose, la configuración, la salud/terminación de los servicios exactos, la identidad segura del target, el schema y los puertos antes de delegar o validar; no debe activar, reparar ni sustituir Docker localmente. Si falla el daemon, el CLI o el socket, debe clasificarlo como `BLOQUEO_DOCKER` externo; si falla la configuración Compose o un servicio requerido, debe clasificarlo como `BLOQUEO_INTEGRATION_ENV`. En ambos casos debe detener delegaciones, implementaciones y validaciones, y no repetir comandos hasta que exista una corrección externa confirmada. La evidencia segura del preflight debe incluirse en la delegación al `integration-test-runner`.
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
- Si el agente owner requerido no existe o no está disponible, detén el trabajo afectado y reporta el bloqueo. No implementes la tarea directamente ni la reasignes a otro owner. El reporte no puede usar un mensaje genérico: debe conservar el identificador del perfil, la ruta de configuración resuelta, la etapa de activación que falló, el error original del loader, el exit code o código de error si existe, y las skills/rutas que no pudieron cargarse. Si el orquestador no expone alguno de esos datos, debe indicarlo explícitamente como `evidencia_no_disponible` y conservar el mensaje bruto recibido.

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
- Las validaciones globales/cross-task y las tareas cuyo acceptance criterion indique
  ejecución única deben ejecutarse una sola vez en el boundary apropiado y delegarse
  al owner de testing correspondiente cuando `tasks.md` lo requiera. Un bloque
  preventivo de remediación explícitamente autorizado se rige por los ciclos acotados
  definidos abajo y no sustituye esa ejecución final.
- Tras una validación fallida, el owner debe aplicar el protocolo portable de remediación definido abajo. No se permiten reintentos por variaciones de sintaxis, binario o directorio sin un diagnóstico que los justifique.
- Ante cualquier fallo de acceptance o HTTP, la evidencia mínima debe incluir comando, exit code, archivo/línea, status HTTP, cuerpo de respuesta, expected/received y primer error observable. Una aserción booleana sin esos datos no basta para clasificar la causa raíz; si el test oculta la respuesta, el owner debe inspeccionar el helper o boundary que la descarta.
- Cuando una tarea declare varios acceptance commands, forman una secuencia continua dentro del mismo scope: si uno pasa después de una remediación, el owner continúa con los siguientes sin solicitar autorización nueva. Solo un bloqueo externo, un owner/scope no autorizado o el límite de ciclos detiene esa secuencia.
- Ningún wrapper, preflight, delegación o cierre de subagente debe sustituir una excepción, stderr, stdout, exit code o código de error por frases genéricas como "no se pudo completar". Todo bloqueo debe conservar el comando exacto seguro, la fase, el exit code, el mensaje original y la evidencia relevante, omitiendo únicamente secretos y valores sensibles. Si una capa no puede obtener alguno de esos campos, debe reportar el campo como `no_disponible` y conservar la razón.
- Evita outputs masivos: usa comandos focalizados, filtros y extractos relevantes. No devuelvas logs completos cuando basten el error, resumen y evidencia necesaria.
- Antes de solicitar una validación, el coordinador debe consultar la evidencia ya reportada por el owner y el estado de los archivos desde esa ejecución. Una validación exitosa del owner, incluido `git diff --check`, es evidencia suficiente para el coordinador salvo que haya cambios posteriores en los archivos validados, falte evidencia verificable o una integración cross-task exija una comprobación distinta. Revisar un diff para entenderlo no autoriza a repetir su validación.

### Seguridad estricta de tipos en artefactos de test

Esta regla es portable y aplica a todo owner de tests y a todo artefacto de test TypeScript/TSX, incluidos fixtures, factories, helpers y mocks.

- Antes de reportar éxito, el owner debe ejecutar el comando de typecheck estricto soportado por el repositorio que cubra los artefactos de test incluidos en el alcance de la tarea o validados en ese bloque. Si el repositorio solo expone esa comprobación mediante un build, ese build solo sirve como evidencia cuando su compilador estricto incluye dichos artefactos; una ejecución de tests o una transpilación sin comprobación de tipos no la sustituye.
- Un `implicit any` en un artefacto de test es siempre un defecto de test. El tipo `any` explícito solo puede existir en un límite externo genuinamente no tipado y debe justificarse junto a su uso; en límites no confiables se debe preferir `unknown` y estrecharlo mediante el contrato observable.
- La evidencia del typecheck debe indicar el comando soportado y su resultado. No se reporta la tarea como completada si falta esa evidencia.
- Si no existe un comando soportado que cubra de forma fiable los artefactos de test, se clasifica como bloqueo de tooling y se detiene el bloque. No se sustituye por un build de producción que no los incluya, un transpiler sin tipos ni un comando ad-hoc.
- En una auditoría, una falla del typecheck estricto o un `implicit any` se reporta como finding `typescript` de severidad `high` y estado `requires_changes`. Un `any` explícito sin justificación válida, un ensanchamiento inseguro o la ausencia de evidencia se reportan como `typescript` de severidad `medium` y estado `requires_changes`.

### Protocolo portable de remediación de validaciones

Este protocolo es una regla del repositorio y aplica independientemente de la herramienta de planificación, ejecución u orquestación utilizada.

- Fuera del barrido diagnóstico de un bloque preventivo explícitamente autorizado,
  ante el primer fallo el owner de la validación detiene sus propios comandos,
  conserva la evidencia mínima y propone una clasificación: defecto de producto,
  defecto de test, defecto de contrato, defecto de comando/runtime, bloqueo de
  entorno o flake.
- El owner puede corregir directamente solo los archivos y responsabilidades que su tarea le autoriza. Un builder no modifica tests; un test owner no modifica producción, contratos ni infraestructura de producto.
- Antes de modificar producción o tests por un fallo de contrato, el owner debe localizar la fuente normativa aplicable en este orden: contrato o especificación formal del proyecto, implementación del boundary afectado, pruebas de integración y acceptance tests. Una expectativa de acceptance no se considera normativa por sí sola.
- La autorización explícita para el ciclo 1 puede provenir de la propia tarea cuando sus criterios de aceptación autorizan corregir una clase de defecto dentro de un scope concreto. Cuando el diagnóstico pertenece al owner inicial y está dentro del scope y la responsabilidad autorizados por la tarea, el ciclo 1 se inicia automáticamente; no se requiere una autorización adicional del coordinador.
- "Detener el bloque" significa detener el inicio de tareas dependientes y conservar la evidencia del diagnóstico. No significa detener una remediación autorizada que todavía deba ejecutarse dentro del ciclo actual.
- Si la clasificación pertenece al owner inicial y la tarea autoriza esa corrección, el owner corrige la causa raíz una vez dentro del ciclo actual, ejecuta la verificación focalizada necesaria y permite la reejecución definida por ese ciclo. Esto no autoriza una segunda edición dentro del mismo ciclo.
- Si la clasificación requiere otro owner que no sea un test owner, o la corrección queda fuera del scope de la tarea original, el coordinador bloquea el trabajo afectado y solicita una tarea o autorización explícita; no hace reasignaciones implícitas.
- Si la evidencia demuestra que el defecto pertenece exclusivamente al ámbito de un test owner y no requiere cambiar producción ni el entorno, el coordinador pausa la tarea original y delega una remediación al owner correctivo dentro del ciclo autorizado. El handoff debe incluir task, comando, exit code, primer error, archivo/línea, clasificación propuesta, scope permitido y validación focalizada esperada.
- Cuando la remediación usa un handoff, cada ciclo consta exactamente de: (1) una delegación al owner correctivo, (2) una validación focalizada del tester y (3) una reejecución del comando original por el owner inicial. La tarea original permanece pausada hasta que el tester entregue evidencia suficiente.
- El owner correctivo debe preservar el contrato y la calidad: no puede debilitar aserciones, omitir tests, ocultar errores, añadir reintentos para forzar un resultado verde ni cambiar archivos fuera de su scope. Si el test válido expone un defecto de producción o de contrato, debe devolverlo con evidencia al owner correspondiente.
- Para este protocolo, el fingerprint de un diagnóstico es la combinación normalizada
  de comando, clasificación, owner, ruta, código y mensaje del error. Hay progreso
  verificable únicamente cuando el fingerprint desaparece o disminuye el número total
  de diagnósticos del scope autorizado.
- El owner inicial reanuda solo después de la confirmación del owner correctivo y ejecuta una sola vez el comando original del ciclo. Un bloque preventivo de remediación explícitamente autorizado puede tener como máximo tres ciclos numerados; el primer barrido diagnóstico no cuenta como ciclo. Durante ese barrido, los errores ordinarios de código, typecheck o lint se recopilan y clasifican sin detener los comandos independientes; solo un bloqueo externo detiene el barrido. Si todos los comandos pasan, el bloque termina inmediatamente y no se inicia el ciclo restante.
- Si no existe una autorización explícita para un bloque preventivo acotado, solo se permite el ciclo 1; cualquier fallo de su reejecución bloquea el trabajo.
- Solo se permite iniciar el ciclo siguiente cuando la reejecución del ciclo anterior produjo progreso verificable y cada nuevo diagnóstico pertenece a un comando ya incluido y a un owner y scope ya autorizados en el bloque. Un cambio de fingerprint o de clasificación no bloquea por sí solo si el nuevo diagnóstico sigue dentro de ese owner y scope autorizados; debe aislarse y tratarse como el siguiente ciclo. Si reaparece el mismo fingerprint sin cambios efectivos, no disminuye el conjunto de diagnósticos, aparece un error no relacionado, se requiere un owner o scope nuevo, el owner no puede resolverlo o se alcanza el tercer ciclo, el bloque queda bloqueado. No se encadenan ciclos adicionales ni se reintenta el mismo ciclo.
- Los fallos de runtime, servicios, bases de datos, migraciones, puertos, credenciales o herramientas inactivas son bloqueos de entorno. Si una herramienta necesaria no está disponible o habilitada, la ejecución se detiene por completo: no se delegan nuevas tareas, no se ejecutan validaciones posteriores, no se editan archivos y no se repite el comando hasta que exista una corrección externa confirmada. El reporte debe indicar la categoría, la causa observada, la evidencia segura y la acción externa requerida.
- Ninguna tarea dependiente avanza durante la pausa o el bloqueo. La tarea solo se completa cuando el comando original pasa y el owner entrega evidencia de la validación; el resultado de la remediación por sí solo no la completa.

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
