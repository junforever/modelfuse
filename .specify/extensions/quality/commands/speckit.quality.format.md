---
name: speckit.quality.format
description: Formatea el código del proyecto con Prettier una única vez, cuando TODAS las tareas del comando implement han finalizado.
---

# Formatear código con Prettier (cierre de implementación)

Este comando valida que Prettier esté instalado y configurado, y luego formatea el código del proyecto.

## Cuándo se ejecuta (OBLIGATORIO)

- Ejecuta este comando **UNA ÚNICA VEZ**, al final, cuando **TODAS** las tareas del comando `implement` actual hayan terminado.
- **NO** lo ejecutes después de cada tarea individual.
- Si eres un **subagente** ejecutando una tarea, **NO ejecutes este comando**.
- **Guardia previa:** antes de formatear, abre el archivo `tasks.md` de la feature actual y verifica que **todas** las tareas estén marcadas como completas (`[X]` / `[x]`). Si existe al menos una tarea pendiente (`[ ]`), **NO formatees**: devuelve el control y continúa con el flujo normal.

## Instrucciones para el Agente de IA

Determina el sistema operativo del entorno actual y ejecuta el script correspondiente:

- **Linux / macOS:** Ejecuta el script `scripts/bash/format.sh` desde la raíz del repositorio usando `bash .specify/extensions/quality/scripts/bash/format.sh`.
- **Windows:** Ejecuta el script `scripts/powershell/format.ps1` desde la raíz del repositorio usando `powershell -NoProfile -ExecutionPolicy Bypass -File .specify/extensions/quality/scripts/powershell/format.ps1`.

Los scripts están ubicados en la ruta relativa a la extensión instalada:
`.specify/extensions/quality/scripts/`

## Comportamiento esperado

1. El script verifica que Prettier esté instalado. Si no lo está, devuelve un error indicando que prettier debe estar instalado.
2. El script verifica que exista un archivo de configuración de Prettier. Si no existe, devuelve un error indicando que debe definirse.
3. El script debe invocar Prettier mediante el wrapper `agent-scripts/run-pnpm.ps1` para reutilizar el runtime aprobado del repositorio. Si el wrapper falla, o no existe, el formateo no debe ejecutarse y se debe propagar el error; no debe buscar otra instalación de Node o pnpm ni modificar `PATH`.
4. Si las validaciones anteriores pasan, ejecuta el formateo.

## Después del formateo (OBLIGATORIO)

- Los cambios de Prettier son **puramente cosméticos** (espacios, comillas, punto y coma, saltos de línea). **No alteran la lógica del código.**
- **NO** vuelvas a ejecutar pruebas, builds, typecheck ni linters a causa del formateo.
- **NO** re-leas, re-chequees ni re-valides los archivos modificados por Prettier.
- **NO** inicies ningún ciclo nuevo de revisión o verificación derivado de estos cambios.
- Limita tu respuesta a un reporte breve del resultado del script.

## Reglas

- No ejecutes el formateo si alguna validación falla.
- No modifiques código manualmente. Deja que Prettier haga el formateo.
- Reporta al usuario el resultado final del script de forma clara.
