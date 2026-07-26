# Feature Specification: Comparación y consolidación de respuestas LLM

**Feature Branch**: `001-compare-llm-responses`  
**Created**: 2026-07-24  
**Status**: Draft  
**Input**: User description: "Aplicación web para enviar un mismo prompt a tres modelos LLM, comparar sus respuestas en tabs separados, obtener una cuarta respuesta integradora, mantener conversaciones continuas y recuperar conversaciones persistidas desde un historial lateral."

## Clarifications

### Session 2026-07-24

- Q: ¿Qué historial recibe cada modelo en los turnos siguientes? → A: Cada modelo principal conserva solo su historial individual; el integrador conserva su historial consolidado y recibe únicamente las tres respuestas nuevas del turno.
- Q: ¿Cómo se administran las conversaciones desde la barra lateral? → A: Cada conversación ofrece un menú de tres puntos para renombrar mediante un modal con límite de 80 caracteres o eliminar mediante confirmación.
- Q: ¿Cómo se recupera y navega el historial dentro de una conversación? → A: Se cargan inicialmente los últimos 3 turnos como unidades completas y los bloques anteriores se recuperan al hacer scroll hacia arriba, sin botones ni números de página.

### Session 2026-07-25

- Q: ¿Qué proveedores y modelo integrador forman los cuatro slots de v1? → A: Los modelos base pertenecen a OpenAI, Google y MiniMax; el modelo consolidador es Qwen, sin asumir un protocolo común entre ellos.
- Q: ¿Qué responsabilidad tiene `index.ts` durante el arranque? → A: Únicamente iniciar y detener la aplicación mediante módulos dedicados; no contiene lógica de negocio ni recuperación.
- Q: ¿Qué estados reconcilia la recuperación tras un reinicio? → A: Todos los slots no terminales relevantes, al menos `pending` y `running`, y después recalcula el estado del turno.
- Q: ¿Cómo se compone el contexto conversacional? → A: Cada base usa solo su historial y el nuevo mensaje; Qwen usa su historial, el nuevo mensaje y las respuestas base actuales, nunca historiales base completos.
- Q: ¿Cómo se muestran mensajes históricos largos? → A: Se colapsan por un umbral de caracteres configurable mediante entorno y ofrecen “Mostrar más / Mostrar menos”, sin nuevas peticiones ni cambios de persistencia.
- Q: ¿Cómo se distinguen los errores de credenciales? → A: Una credencial ausente es fatal en startup; una credencial presente pero rechazada produce un error recuperable solo en su slot.
- Q: ¿Cómo se validan los objetivos de latencia? → A: Con providers fake y entorno local reproducible, midiendo `POST /conversations` y el primer bloque de historial por debajo de un segundo.
- Q: ¿Cómo se valida la recuperación persistente? → A: Recreando la aplicación o sus servicios sobre la misma base de datos y comprobando orden, atribución, estados coherentes y consulta posterior.
- Q: ¿Cómo se verifica la calidad mínima de consolidación? → A: Con un fixture versionado de máximo cinco casos y checks automáticos simples; se exige superar al menos el 90% de los checks.
- Q: ¿Cuál es la unidad de retry? → A: Un slot individual; un retry base exitoso reemplaza la consolidación obsoleta, uno fallido conserva la mejor consolidación válida y no relanza otra.
- Q: ¿Cómo se genera y edita el título? → A: El título inicial es el primer prompt con trim truncado a 80 caracteres; rename muestra contador, bloquea Guardar en blanco y acepta texto libre validado por backend.
- Q: ¿Cómo navega el sidebar sus conversaciones? → A: Con scroll infinito hacia abajo, carga suficiente para llenar el contenedor y páginas de tamaño fijo configurable, sin controles de paginación visibles.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comparar y consolidar respuestas (Priority: P1)

Como usuario, quiero enviar un prompt una sola vez a tres modelos y ver cada respuesta completa en una pestaña distinta, junto con una cuarta respuesta consolidada, para comparar enfoques y obtener una respuesta final más completa.

**Why this priority**: Es el valor principal del producto; sin comparación paralela ni consolidación no existe una experiencia útil mínima.

**Independent Test**: Se puede probar con una conversación nueva, enviando un prompt y verificando que los tres modelos lo reciban, que cada pestaña muestre la respuesta correcta y que la cuarta sintetice las respuestas disponibles.

**Acceptance Scenarios**:

1. **Given** una conversación nueva y las integraciones disponibles, **When** el usuario envía un prompt, **Then** el sistema solicita en paralelo las respuestas de los modelos base de OpenAI, Google y MiniMax, y muestra cada respuesta completa en su pestaña identificada.
2. **Given** que los tres modelos de comparación respondieron, **When** Qwen procesa el turno como consolidador, **Then** la cuarta pestaña muestra una respuesta unificada que elimina redundancias, incorpora aportes relevantes y atiende vacíos detectados.
3. **Given** que el usuario cambia entre pestañas, **When** selecciona una pestaña, **Then** ve únicamente la respuesta correspondiente, sin perder ni mezclar el contenido de las demás.
4. **Given** que uno de los modelos de comparación falla o no responde, **When** termina el procesamiento del turno, **Then** su pestaña muestra un estado de error claro, la consolidación se produce con las respuestas disponibles y el usuario puede reintentar ese slot o continuar sin esa respuesta.

---

### User Story 2 - Continuar una conversación (Priority: P2)

Como usuario, quiero enviar mensajes posteriores dentro de la misma conversación para que cada modelo y el integrador respondan teniendo en cuenta los turnos anteriores.

**Why this priority**: Permite iterar, corregir y profundizar resultados, en lugar de limitar el producto a consultas aisladas.

**Independent Test**: Se puede probar creando historiales distintos para los cuatro modelos y enviando un nuevo mensaje; cada modelo principal debe usar solo su historial individual y el integrador debe usar su historial consolidado más las tres respuestas nuevas.

**Acceptance Scenarios**:

1. **Given** una conversación con al menos un turno completo, **When** el usuario envía un mensaje de seguimiento, **Then** cada modelo de comparación recibe el nuevo mensaje y únicamente su propio historial individual.
2. **Given** las tres respuestas individuales del turno actual, **When** se genera la respuesta consolidada, **Then** el integrador recibe el prompt actual, su historial propio de prompts y respuestas consolidadas anteriores, y las tres respuestas nuevas, pero no los historiales de los modelos de comparación.
3. **Given** varios turnos en una conversación, **When** el usuario revisa cualquier turno, **Then** puede distinguir el prompt y las cuatro respuestas asociadas a ese turno.
4. **Given** un slot base fallido, **When** el usuario decide continuar sin reintentar, **Then** el turno conserva una indicación persistida y visible de la ausencia y la conversación permite enviar el siguiente mensaje.

---

### User Story 3 - Recuperar conversaciones guardadas (Priority: P3)

Como usuario, quiero ver las conversaciones guardadas en una barra lateral izquierda y seleccionar cualquiera para consultarla o continuarla.

**Why this priority**: La persistencia convierte el historial en trabajo reutilizable y evita perder el contexto entre sesiones.

**Independent Test**: Se puede probar con una conversación de más de seis turnos, reabriéndola para verificar que aparecen inicialmente solo los últimos tres turnos completos y que los anteriores se incorporan en bloques al hacer scroll hacia arriba, sin controles de paginación.

**Acceptance Scenarios**:

1. **Given** conversaciones guardadas, **When** el usuario abre la aplicación, **Then** la barra lateral carga las más recientes primero y continúa cargando hacia abajo hasta llenar su altura visible o agotar los resultados.
2. **Given** una conversación guardada con más de tres turnos, **When** el usuario la selecciona, **Then** se cargan únicamente sus últimos tres turnos como unidades completas, ordenados cronológicamente y mostrando primero el tramo más reciente.
3. **Given** una conversación con historial anterior disponible, **When** el usuario llega al inicio del tramo cargado haciendo scroll hacia arriba, **Then** se antepone el bloque anterior de hasta tres turnos completos sin reemplazar el historial ya visible.
4. **Given** una conversación abierta, **When** el usuario carga bloques anteriores, **Then** conserva una experiencia de chat continuo sin botones, números de página ni navegación a una vista distinta.
5. **Given** una conversación recuperada, **When** el usuario envía otro mensaje, **Then** el nuevo turno se agrega a esa misma conversación, queda persistido y el historial anterior continúa disponible mediante scroll ascendente.
6. **Given** que no existen conversaciones guardadas, **When** el usuario abre la aplicación, **Then** ve un estado vacío claro y puede iniciar una conversación nueva.
7. **Given** una conversación guardada, **When** el usuario abre su menú de tres puntos y elige renombrar, **Then** aparece un modal con un campo de hasta 80 caracteres, un contador de caracteres restantes y acciones explícitas para guardar o cancelar.
8. **Given** un nombre válido en el modal de renombrado, **When** el usuario confirma, **Then** el nuevo nombre se muestra en la barra lateral y permanece después de recargar la aplicación.
9. **Given** una conversación guardada, **When** el usuario elige eliminar en su menú, **Then** debe confirmar la acción en un modal antes de que la conversación sea eliminada de forma persistente.
10. **Given** más conversaciones que las visibles en el sidebar, **When** el usuario se desplaza hacia abajo, **Then** se añade la siguiente página sin botones, números ni controles de paginación.
11. **Given** un mensaje recuperado del historial que supera el umbral configurado, **When** se muestra el turno, **Then** el mensaje aparece colapsado y permite alternar entre “Mostrar más” y “Mostrar menos” sin realizar otra petición.

---

### User Story 4 - Iniciar un contexto nuevo (Priority: P4)

Como usuario, quiero limpiar la conversación actual para comenzar una nueva sin contexto previo, conservando las conversaciones ya guardadas en el historial.

**Why this priority**: Evita contaminar consultas nuevas con contexto anterior y hace explícita la separación entre conversaciones.

**Independent Test**: Se puede probar partiendo de una conversación guardada, creando una nueva y verificando que el primer mensaje no use el contexto anterior y que la conversación previa siga disponible.

**Acceptance Scenarios**:

1. **Given** una conversación actual con contenido, **When** el usuario inicia una conversación nueva, **Then** el área principal queda vacía y el siguiente mensaje no incluye contexto de la conversación anterior.
2. **Given** una conversación persistida, **When** el usuario inicia una nueva, **Then** la conversación anterior permanece disponible en el historial.
3. **Given** una conversación nueva todavía vacía, **When** el usuario intenta iniciar otra, **Then** el sistema mantiene una única conversación vacía y no crea entradas de historial sin contenido.

### Edge Cases

- Si falta una credencial requerida, el backend no inicia e identifica únicamente la variable ausente, sin revelar valores secretos.
- Si una credencial está presente pero el proveedor la rechaza, solo el slot afectado muestra un error recuperable y las demás respuestas permanecen disponibles.
- Si uno o más modelos exceden el tiempo de espera, las respuestas exitosas permanecen visibles y el usuario puede reintentar cada slot fallido sin duplicar los resultados exitosos.
- Si el integrador falla, las tres respuestas individuales permanecen disponibles y la pestaña consolidada ofrece reintentar solo la consolidación.
- Si un retry base termina correctamente y recupera una respuesta antes ausente, la consolidación anterior se marca como obsoleta y se reemplaza por una nueva; si el retry vuelve a fallar, no se relanza la consolidación y se conserva la mejor consolidación válida existente, si la hay.
- Si el usuario continúa sin un slot base fallido, la ausencia queda persistida y visible dentro de ese turno, y los turnos posteriores siguen disponibles aunque el proveedor permanezca fuera de línea.
- Si el usuario cambia de conversación mientras hay respuestas en curso, los resultados se guardan en la conversación que originó la solicitud y no aparecen en la conversación seleccionada después.
- Si el campo del mensaje está vacío o está compuesto solo por espacios, el botón de enviar el mensaje no se activa, por lo tanto el sistema no crea un turno ni realiza solicitudes.
- Si una conversación es extensa, cada modelo usa una ventana acotada de sus turnos históricos permitidos y el sistema comunica cuando no se incluyó todo el contexto.
- Si se recarga o cierra la aplicación durante una respuesta en curso, los resultados completados permanecen guardados; al reiniciar, un módulo de recovery reconcilia al menos los slots `pending` y `running` y recalcula el turno para que no quede atascado.
- Si dos conversaciones tienen contenidos iniciales similares, la barra lateral también muestra su fecha de actualización para diferenciarlas.
- Si el nuevo nombre está vacío, contiene solo espacios o supera 80 caracteres, el sistema no permite confirmar el renombrado y conserva el nombre anterior.
- Si el usuario cancela el renombrado o la eliminación, la conversación no cambia.
- Si el usuario elimina la conversación activa, el sistema muestra una conversación nueva y vacía; las demás conversaciones guardadas permanecen intactas.
- Si una conversación contiene tres turnos o menos, la carga inicial muestra todos sus turnos y no intenta recuperar un bloque anterior.
- Si un turno contiene respuestas pendientes o fallidas, se carga como una unidad con el prompt y todos los estados de respuesta asociados; nunca se divide en mensajes sueltos.
- Al anteponer turnos anteriores, el sistema conserva la posición visual del usuario para evitar un salto brusco del contenido.
- Colapsar o expandir un mensaje histórico largo solo cambia su presentación local; no solicita otra página, no altera su contenido persistido y no afecta mensajes nuevos todavía no recuperados como historial.
- Si la primera página de conversaciones no llena la altura visible del sidebar, el sistema solicita páginas adicionales hasta llenar el contenedor o agotar los resultados.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir escribir y enviar un prompt desde la conversación activa.
- **FR-002**: El sistema NO DEBE permitir enviar mensajes vacíos o compuestos únicamente por espacios.
- **FR-003**: El sistema DEBE enviar cada nuevo mensaje a exactamente tres modelos base, uno perteneciente a OpenAI, uno a Google y uno a MiniMax, sin exigir tres acciones separadas al usuario.
- **FR-004**: El sistema DEBE iniciar en paralelo las solicitudes a los tres modelos de comparación.
- **FR-005**: El sistema DEBE mostrar cuatro pestañas en la parte inferior del área de conversación: una por cada modelo de comparación y una para la respuesta consolidada.
- **FR-006**: Cada pestaña DEBE identificar visualmente su modelo o su función integradora y mostrar la respuesta completa del turno seleccionado.
- **FR-007**: El sistema DEBE mantener separados los estados de carga, éxito y error de cada una de las cuatro respuestas.
- **FR-008**: Qwen DEBE actuar como modelo consolidador y generar su respuesta usando el nuevo mensaje del usuario, su historial propio de prompts y respuestas consolidadas anteriores, y las respuestas base disponibles del turno actual; NO DEBE recibir los historiales completos previos de OpenAI, Google ni MiniMax.
- **FR-009**: La respuesta consolidada DEBE sintetizar aportes relevantes, eliminar repeticiones y atender información faltante útil para responder al usuario, sin presentarse como una simple concatenación.
- **FR-010**: Si falla un modelo de comparación, el sistema DEBE conservar las demás respuestas y permitir que el integrador trabaje con las disponibles, indicando cuáles faltaron.
- **FR-011**: Si falla la consolidación, el sistema DEBE conservar las respuestas individuales y permitir reintentar únicamente la consolidación.
- **FR-012**: El sistema DEBE mantener conversaciones de múltiples turnos y asociar cada prompt con sus tres respuestas individuales y su respuesta consolidada.
- **FR-013**: En cada nuevo turno, cada modelo base DEBE recibir únicamente el nuevo mensaje del usuario y el historial formado por los mensajes del usuario y las respuestas previas de ese mismo modelo dentro de la conversación activa.
- **FR-014**: El sistema DEBE persistir automáticamente las conversaciones con contenido, incluidos sus turnos, respuestas, estados incompletos y fechas de creación y actualización.
- **FR-015**: El sistema DEBE listar en una barra lateral izquierda las conversaciones guardadas, ordenadas de la más recientemente actualizada a la menos reciente y recuperadas incrementalmente mediante scroll descendente.
- **FR-016**: Cada entrada del historial DEBE mostrar su título, la fecha de actualización y un menú de tres puntos situado al final del nombre.
- **FR-017**: El usuario DEBE poder seleccionar una conversación guardada, revisar progresivamente todos sus turnos y continuarla con contexto.
- **FR-018**: El usuario DEBE poder iniciar una conversación nueva y vacía sin eliminar ni modificar conversaciones previamente guardadas.
- **FR-019**: El sistema NO DEBE crear una entrada persistida para una conversación que todavía no contenga mensajes.
- **FR-020**: El sistema DEBE leer y validar durante startup las credenciales requeridas para OpenAI, Google, MiniMax y la integración de Qwen; si falta cualquiera de ellas, el backend NO DEBE iniciar y el error solo DEBE identificar la variable ausente.
- **FR-021**: El sistema NO DEBE mostrar credenciales en la interfaz ni almacenarlas como parte de prompts, respuestas o metadatos de conversación.
- **FR-022**: Una credencial presente pero rechazada, un error de conectividad, un límite o un timeout DEBEN afectar únicamente al slot correspondiente, mostrar un error seguro e identificar una acción recuperable cuando sea posible.
- **FR-023**: Los resultados de una solicitud en curso DEBEN permanecer asociados a la conversación y turno que la originaron aunque el usuario navegue a otra conversación.
- **FR-024**: La interfaz DEBE diferenciar visualmente respuestas individuales y consolidadas mediante etiquetas persistentes que no dependan solo del color.
- **FR-025**: El menú de cada conversación guardada DEBE ofrecer únicamente las acciones de renombrar y eliminar.
- **FR-026**: La acción de renombrar DEBE abrir un modal con un campo limitado a 80 caracteres, un contador de caracteres restantes debajo del campo y acciones explícitas para guardar o cancelar; Guardar DEBE permanecer deshabilitado si el valor está vacío o contiene solo espacios.
- **FR-027**: El nombre manual DEBE aceptar texto libre sin restricciones especiales de caracteres a nivel de producto, tener entre 1 y 80 caracteres después de trim y ser saneado y validado por el backend antes de persistirse; cancelar o enviar un valor inválido DEBE conservar el nombre anterior.
- **FR-028**: La acción de eliminar DEBE abrir un modal de confirmación y NO DEBE eliminar ningún dato antes de que el usuario confirme explícitamente.
- **FR-029**: Tras la confirmación, el sistema DEBE eliminar de forma persistente la conversación y todos sus turnos y respuestas; si era la conversación activa, DEBE mostrar una conversación nueva y vacía.
- **FR-030**: Al abrir o reabrir una conversación, el sistema DEBE cargar inicialmente como máximo sus últimos tres turnos y NO DEBE recuperar automáticamente todo el historial.
- **FR-031**: La unidad de recuperación DEBE ser el turno completo, compuesto por el prompt del usuario y todas las respuestas y estados asociados a ese turno; el sistema NO DEBE paginar mensajes individuales.
- **FR-032**: Cuando el usuario alcance el inicio del tramo visible mediante scroll ascendente, el sistema DEBE cargar y anteponer incrementalmente el bloque anterior de hasta tres turnos completos.
- **FR-033**: La navegación del historial dentro de la conversación NO DEBE mostrar botones de anterior/siguiente, números de página ni controles equivalentes.
- **FR-034**: La carga incremental DEBE conservar el orden cronológico, los turnos ya visibles y la posición visual del usuario.
- **FR-035**: El mismo comportamiento de ventana inicial y scroll ascendente DEBE aplicarse tanto al reabrir una conversación guardada como al continuar una conversación existente.
- **FR-036**: Cada proveedor DEBE integrarse mediante su protocolo y adapter correspondiente; el sistema NO DEBE asumir que OpenAI, Google, MiniMax y Qwen comparten un protocolo común.
- **FR-037**: `index.ts` DEBE limitarse a iniciar y detener la aplicación llamando módulos dedicados; NO DEBE contener lógica de negocio ni implementación de recuperación.
- **FR-038**: Un módulo de startup/recovery DEBE reconciliar después de un reinicio todos los slots no terminales relevantes, incluidos al menos `pending` y `running`, y recalcular el estado de cada turno afectado para dejarlo en un estado coherente y consultable.
- **FR-039**: Cuando un mensaje proveniente del historial ya cargado supere el umbral de caracteres configurado mediante una variable de entorno, la interfaz DEBE mostrarlo colapsado con la opción “Mostrar más / Mostrar menos”; esta interacción NO DEBE realizar nuevas peticiones ni modificar la persistencia.
- **FR-040**: Ante un slot base fallido, el usuario DEBE poder elegir inmediatamente entre reintentar solo ese slot o continuar la conversación sin esa respuesta; continuar DEBE persistir y mostrar en el slot una indicación de ausencia y NO DEBE bloquear turnos posteriores.
- **FR-041**: Si un retry base recupera una respuesta antes ausente, la consolidación previa del mismo turno DEBE considerarse obsoleta y reemplazarse por una nueva respuesta de Qwen; si el retry vuelve a fallar, el sistema NO DEBE relanzar otra consolidación y DEBE conservar la mejor consolidación válida existente, si la hay.
- **FR-042**: El título inicial DEBE ser el resultado de aplicar trim al primer prompt y tomar sus primeros 80 caracteres, truncándolo a ese límite cuando sea necesario; ese título permanece como valor por defecto hasta un renombrado confirmado.
- **FR-043**: El sidebar DEBE usar scroll infinito hacia abajo sin controles de paginación visibles, cargar inicialmente suficientes conversaciones para llenar la altura disponible cuando existan y seguir cargando hasta llenarla o agotar resultados; las páginas posteriores DEBEN usar un tamaño fijo configurable mediante una variable de entorno.

### Key Entities

- **Conversación**: Sesión continua con identidad, título renombrable de hasta 80 caracteres, fechas de creación y actualización, estado, una secuencia ordenada de turnos y cuatro hilos de contexto independientes.
- **Turno**: Unidad atómica de recuperación dentro de una conversación que contiene el prompt del usuario, su posición, las tres respuestas individuales nuevas que alimentan al integrador, la respuesta consolidada, sus estados asociados y cualquier indicación persistida de respuesta ausente.
- **Respuesta de modelo**: Resultado asociado a un turno y a un slot específico, con proveedor, modelo, contenido completo o indicación de ausencia, estado de procesamiento y detalle de error recuperable cuando corresponda.
- **Modelo participante**: Identidad visible y rol de OpenAI, Google o MiniMax como modelo base, o de Qwen como modelo consolidador.
- **Configuración de credencial**: Disponibilidad y validez operativa de la credencial requerida por cada proveedor, sin formar parte del contenido conversacional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En un entorno local controlado con providers fake deterministas, al menos el 95% de las consultas alcanza dentro de 60 segundos una respuesta o estado terminal explícito para cada slot, sin depender de la latencia de proveedores externos.
- **SC-002**: Al recrear la aplicación o sus servicios sobre la misma base de datos persistida, el 100% de las conversaciones conserva el orden de turnos, la atribución correcta de respuestas, estados coherentes y la posibilidad de consulta posterior.
- **SC-003**: Al menos el 90% de usuarios de una prueba de usabilidad puede enviar un prompt, comparar las cuatro respuestas y reconocer cuál es la consolidada sin ayuda en su primer intento.
- **SC-004**: Al menos el 90% de usuarios de una prueba de usabilidad puede abrir una conversación anterior, continuarla e iniciar otra conversación sin confundir sus contextos.
- **SC-005**: Sobre un fixture versionado de máximo cinco casos, la respuesta de Qwen DEBE superar al menos el 90% de los checks automáticos simples y observables definidos en el fixture para conservación de aportes requeridos, cobertura de información faltante y ausencia de bloques repetidos; esta validación NO constituye un framework general de ranking.
- **SC-006**: En el 100% de las pruebas donde falla un único modelo, las respuestas exitosas siguen disponibles y el usuario recibe una indicación clara del fallo y de la acción posible.
- **SC-007**: El 100% de las etiquetas de respuesta permite identificar el modelo o rol sin depender exclusivamente del color.
- **SC-008**: En el 100% de las pruebas de gestión del historial, un renombrado confirmado permanece tras recargar, una cancelación no altera datos y una eliminación solo ocurre después de confirmación.
- **SC-009**: En el 100% de las pruebas con conversaciones de más de tres turnos, la carga inicial contiene únicamente los tres más recientes y cada scroll ascendente incorpora el bloque anterior completo sin controles de paginación ni pérdida de la posición visual.
- **SC-010**: En el entorno local controlado con providers fake, `POST /conversations` DEBE responder `202` en menos de un segundo y la consulta del primer bloque de historial DEBE responder en menos de un segundo en el 100% de las ejecuciones de aceptación.
- **SC-011**: En el 100% de las pruebas del sidebar con resultados suficientes, la carga inicial llena su altura visible y el scroll descendente incorpora páginas del tamaño configurado sin botones, números ni controles de página.
- **SC-012**: En el 100% de las pruebas con mensajes históricos por encima del umbral configurado, el contenido aparece inicialmente colapsado, alterna entre “Mostrar más” y “Mostrar menos” y no provoca solicitudes adicionales ni escrituras.

## Assumptions

- La primera versión está orientada a un único usuario en un entorno privado; cuentas, roles y colaboración entre usuarios quedan fuera de alcance.
- Los modelos participantes están predefinidos: un modelo base de OpenAI, uno de Google, uno de MiniMax y Qwen como consolidador; seleccionarlos o cambiarlos desde la interfaz queda fuera de alcance.
- Cada proveedor puede requerir un protocolo diferente y su integración no depende de compatibilidad con la API de OpenAI.
- “Limpiar la conversación” significa iniciar una conversación nueva sin borrar la conversación anterior; la eliminación solo ocurre mediante la acción explícita del menú y su confirmación.
- El título inicial se deriva del primer prompt conforme a FR-042 y posteriormente puede renombrarse desde la barra lateral.
- Los proveedores externos pueden imponer límites de longitud, uso y tiempo de respuesta; el producto debe comunicar esos límites cuando afecten una solicitud.
- La disponibilidad, costo, exactitud y políticas de contenido de los modelos externos dependen de sus respectivos proveedores.
- Para la operación normal, el entorno cuenta con conectividad y credenciales configuradas; los casos de credencial ausente o rechazada se rigen por FR-020 y FR-022.
