# Feature Specification: Comparación y consolidación de respuestas LLM

**Feature Branch**: `001-compare-llm-responses`  
**Created**: 2026-07-24  
**Status**: Draft  
**Input**: User description: "Aplicación web para enviar un mismo prompt a tres modelos LLM, comparar sus respuestas en tabs separados, obtener una cuarta respuesta integradora, mantener conversaciones continuas y recuperar conversaciones persistidas desde un historial lateral."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comparar y consolidar respuestas (Priority: P1)

Como usuario, quiero enviar un prompt una sola vez a tres modelos y ver cada respuesta completa en una pestaña distinta, junto con una cuarta respuesta consolidada, para comparar enfoques y obtener una respuesta final más completa.

**Why this priority**: Es el valor principal del producto; sin comparación paralela ni consolidación no existe una experiencia útil mínima.

**Independent Test**: Se puede probar con una conversación nueva, enviando un prompt y verificando que los tres modelos lo reciban, que cada pestaña muestre la respuesta correcta y que la cuarta sintetice las respuestas disponibles.

**Acceptance Scenarios**:

1. **Given** una conversación nueva y los cuatro modelos disponibles, **When** el usuario envía un prompt, **Then** el sistema solicita respuestas a los tres modelos de comparación en paralelo y muestra cada respuesta completa en su pestaña identificada.
2. **Given** que los tres modelos de comparación respondieron, **When** el modelo integrador procesa el turno, **Then** la cuarta pestaña muestra una respuesta unificada que elimina redundancias, incorpora aportes relevantes y atiende vacíos detectados.
3. **Given** que el usuario cambia entre pestañas, **When** selecciona una pestaña, **Then** ve únicamente la respuesta correspondiente, sin perder ni mezclar el contenido de las demás.
4. **Given** que uno de los modelos de comparación falla o no responde, **When** termina el procesamiento del turno, **Then** su pestaña muestra un estado de error claro y la consolidación se produce con las respuestas disponibles, indicando la fuente ausente.

---

### User Story 2 - Continuar una conversación (Priority: P2)

Como usuario, quiero enviar mensajes posteriores dentro de la misma conversación para que cada modelo y el integrador respondan teniendo en cuenta los turnos anteriores.

**Why this priority**: Permite iterar, corregir y profundizar resultados, en lugar de limitar el producto a consultas aisladas.

**Independent Test**: Se puede probar enviando un primer mensaje con un dato de contexto y un segundo mensaje que dependa de ese dato; las cuatro respuestas del segundo turno deben conservar el contexto.

**Acceptance Scenarios**:

1. **Given** una conversación con al menos un turno completo, **When** el usuario envía un mensaje de seguimiento, **Then** los tres modelos reciben el contexto de la conversación y el nuevo mensaje.
2. **Given** las respuestas individuales del turno actual, **When** se genera la respuesta consolidada, **Then** el integrador considera tanto el historial de la conversación como las respuestas individuales de ese turno.
3. **Given** varios turnos en una conversación, **When** el usuario revisa cualquier turno, **Then** puede distinguir el prompt y las cuatro respuestas asociadas a ese turno.

---

### User Story 3 - Recuperar conversaciones guardadas (Priority: P3)

Como usuario, quiero ver las conversaciones guardadas en una barra lateral izquierda y seleccionar cualquiera para consultarla o continuarla.

**Why this priority**: La persistencia convierte el historial en trabajo reutilizable y evita perder el contexto entre sesiones.

**Independent Test**: Se puede probar creando una conversación, cerrando y volviendo a abrir la aplicación, seleccionándola desde la barra lateral y enviando un nuevo mensaje contextual.

**Acceptance Scenarios**:

1. **Given** conversaciones guardadas, **When** el usuario abre la aplicación, **Then** la barra lateral las lista con información suficiente para distinguirlas y con las más recientes primero.
2. **Given** una conversación listada, **When** el usuario la selecciona, **Then** se cargan todos sus turnos y respuestas conservando el modelo al que pertenece cada una.
3. **Given** una conversación recuperada, **When** el usuario envía otro mensaje, **Then** el nuevo turno se agrega a esa misma conversación y queda persistido.
4. **Given** que no existen conversaciones guardadas, **When** el usuario abre la aplicación, **Then** ve un estado vacío claro y puede iniciar una conversación nueva.

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

- Si faltan credenciales o una credencial es inválida, el sistema identifica el modelo afectado con un mensaje accionable sin revelar el valor secreto.
- Si uno o más modelos exceden el tiempo de espera, las respuestas exitosas permanecen visibles y el usuario puede reintentar el turno fallido sin duplicar los turnos exitosos.
- Si el integrador falla, las tres respuestas individuales permanecen disponibles y la pestaña consolidada ofrece reintentar solo la consolidación.
- Si el usuario cambia de conversación mientras hay respuestas en curso, los resultados se guardan en la conversación que originó la solicitud y no aparecen en la conversación seleccionada después.
- Si el campo del mensaje está vacío o está compuesto solo por espacios, el botón de enviar el mensaje no se activa, por lo tanto el sistema no crea un turno ni realiza solicitudes.
- Si una conversación es extensa, el sistema conserva el historial visible y comunica claramente si algún proveedor no puede procesar todo el contexto.
- Si se recarga o cierra la aplicación durante una respuesta en curso, los turnos ya completados permanecen guardados y el turno incompleto se identifica como tal al volver.
- Si dos conversaciones tienen contenidos iniciales similares, la barra lateral también muestra su fecha de actualización para diferenciarlas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir escribir y enviar un prompt desde la conversación activa.
- **FR-002**: El sistema NO DEBE permitir enviar mensajes vacíos o compuestos únicamente por espacios.
- **FR-003**: El sistema DEBE enviar cada nuevo mensaje a exactamente tres modelos de comparación sin exigir tres acciones separadas al usuario.
- **FR-004**: El sistema DEBE iniciar en paralelo las solicitudes a los tres modelos de comparación.
- **FR-005**: El sistema DEBE mostrar cuatro pestañas en la parte inferior del área de conversación: una por cada modelo de comparación y una para la respuesta consolidada.
- **FR-006**: Cada pestaña DEBE identificar visualmente su modelo o su función integradora y mostrar la respuesta completa del turno seleccionado.
- **FR-007**: El sistema DEBE mantener separados los estados de carga, éxito y error de cada una de las cuatro respuestas.
- **FR-008**: El sistema DEBE generar la respuesta consolidada usando el prompt actual, el contexto de la conversación y todas las respuestas individuales disponibles del turno.
- **FR-009**: La respuesta consolidada DEBE sintetizar aportes relevantes, eliminar repeticiones y atender información faltante útil para responder al usuario, sin presentarse como una simple concatenación.
- **FR-010**: Si falla un modelo de comparación, el sistema DEBE conservar las demás respuestas y permitir que el integrador trabaje con las disponibles, indicando cuáles faltaron.
- **FR-011**: Si falla la consolidación, el sistema DEBE conservar las respuestas individuales y permitir reintentar únicamente la consolidación.
- **FR-012**: El sistema DEBE mantener conversaciones de múltiples turnos y asociar cada prompt con sus tres respuestas individuales y su respuesta consolidada.
- **FR-013**: Cada nuevo turno DEBE usar como contexto los turnos anteriores de la conversación activa.
- **FR-014**: El sistema DEBE persistir automáticamente las conversaciones con contenido, incluidos sus turnos, respuestas, estados incompletos y fechas de creación y actualización.
- **FR-015**: El sistema DEBE listar en una barra lateral izquierda las conversaciones guardadas, ordenadas de la más recientemente actualizada a la menos reciente.
- **FR-016**: Cada entrada del historial DEBE mostrar un título reconocible y la fecha de actualización.
- **FR-017**: El usuario DEBE poder seleccionar una conversación guardada, revisar todos sus turnos y continuarla con contexto.
- **FR-018**: El usuario DEBE poder iniciar una conversación nueva y vacía sin eliminar ni modificar conversaciones previamente guardadas.
- **FR-019**: El sistema NO DEBE crear una entrada persistida para una conversación que todavía no contenga mensajes.
- **FR-020**: El sistema DEBE leer las credenciales requeridas para cada proveedor y validar su disponibilidad antes de solicitar una respuesta.
- **FR-021**: El sistema NO DEBE mostrar credenciales en la interfaz ni almacenarlas como parte de prompts, respuestas o metadatos de conversación.
- **FR-022**: Los errores de credenciales, conectividad, límite o tiempo de espera DEBEN identificar la respuesta afectada y ofrecer una acción recuperable cuando sea posible.
- **FR-023**: Los resultados de una solicitud en curso DEBEN permanecer asociados a la conversación y turno que la originaron aunque el usuario navegue a otra conversación.
- **FR-024**: La interfaz DEBE diferenciar visualmente respuestas individuales y consolidadas mediante etiquetas persistentes que no dependan solo del color.

### Key Entities

- **Conversación**: Sesión continua con identidad, título, fechas de creación y actualización, estado y una secuencia ordenada de turnos.
- **Turno**: Interacción dentro de una conversación que contiene el prompt del usuario, su posición y las cuatro respuestas esperadas.
- **Respuesta de modelo**: Resultado asociado a un turno y a un modelo específico, con contenido completo, estado de procesamiento y detalle de error recuperable cuando corresponda.
- **Modelo participante**: Identidad visible y rol de uno de los tres modelos de comparación o del modelo integrador.
- **Configuración de credencial**: Disponibilidad y validez operativa de la credencial requerida por cada proveedor, sin formar parte del contenido conversacional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En al menos el 95% de las consultas con proveedores disponibles, el usuario ve las tres respuestas individuales y la consolidada, o un estado final explícito para cada una, dentro de 60 segundos.
- **SC-002**: El 100% de las conversaciones completadas y guardadas puede recuperarse después de reiniciar la aplicación con el mismo orden de turnos y la misma atribución de respuestas.
- **SC-003**: Al menos el 90% de usuarios de una prueba de usabilidad puede enviar un prompt, comparar las cuatro respuestas y reconocer cuál es la consolidada sin ayuda en su primer intento.
- **SC-004**: Al menos el 90% de usuarios de una prueba de usabilidad puede abrir una conversación anterior, continuarla e iniciar otra conversación sin confundir sus contextos.
- **SC-005**: En un conjunto de evaluación acordado, al menos el 90% de las respuestas consolidadas conserva todos los aportes relevantes no contradictorios presentes en las respuestas individuales y no repite bloques equivalentes.
- **SC-006**: En el 100% de las pruebas donde falla un único modelo, las respuestas exitosas siguen disponibles y el usuario recibe una indicación clara del fallo y de la acción posible.
- **SC-007**: El 100% de las etiquetas de respuesta permite identificar el modelo o rol sin depender exclusivamente del color.

## Assumptions

- La primera versión está orientada a un único usuario en un entorno privado; cuentas, roles y colaboración entre usuarios quedan fuera de alcance.
- Los tres modelos de comparación y el modelo integrador están predefinidos por la configuración del producto; seleccionar o cambiar modelos desde la interfaz queda fuera de alcance.
- “Limpiar la conversación” significa iniciar una conversación nueva sin borrar la conversación anterior; eliminar conversaciones guardadas queda fuera de alcance.
- El título de una conversación se genera a partir de su primer mensaje y no requiere edición manual en esta versión.
- Los proveedores externos pueden imponer límites de longitud, uso y tiempo de respuesta; el producto debe comunicar esos límites cuando afecten una solicitud.
- La disponibilidad, costo, exactitud y políticas de contenido de los modelos externos dependen de sus respectivos proveedores.
- El usuario cuenta con conectividad a internet y credenciales válidas para los cuatro modelos configurados.

