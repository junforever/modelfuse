---
name: speckit.quality.format
description: Valida Prettier, valida su configuración y formatea el código del proyecto.
---

# Formatear código con Prettier

Este comando valida que Prettier esté instalado y configurado, y luego formatea el código del proyecto.

## Instrucciones para el Agente de IA

Determina el sistema operativo del entorno actual y ejecuta el script correspondiente:

- **Linux / macOS:** Ejecuta el script `scripts/bash/format.sh` usando `bash scripts/bash/format.sh`.
- **Windows:** Ejecuta el script `scripts/powershell/format.ps1` usando `powershell -ExecutionPolicy Bypass -File scripts/powershell/format.ps1`.

Los scripts están ubicados en la ruta relativa a la extensión instalada:
`.specify/extensions/quality/scripts/`

## Comportamiento esperado

1. El script verifica que Prettier esté instalado. Si no lo está, devuelve un error con el comando de instalación.
2. El script verifica que exista un archivo de configuración de Prettier. Si no existe, devuelve un error indicando que debe definirse.
3. Si ambas validaciones pasan, ejecuta el formateo.

## Reglas

- No ejecutes el formateo si alguna validación falla.
- No modifiques código manualmente. Deja que Prettier haga el formateo.
- Reporta al usuario el resultado final del script de forma clara.
