# Quality Gate - Spec Kit Extension

Extensión de Spec Kit para validar y mejorar la calidad del código.

## Comandos disponibles

| Comando                  | Descripción                     |
| ------------------------ | ------------------------------- |
| `speckit.quality.format` | Formatea el código con Prettier |

## Hooks

| Evento            | Comando                  | Descripción                                     |
| ----------------- | ------------------------ | ----------------------------------------------- |
| `after_implement` | `speckit.quality.format` | Formatea automáticamente después de implementar |

## Requisitos

- Prettier instalado como dependencia de desarrollo
- Archivo de configuración de Prettier en la raíz del proyecto

## Instalación (desarrollo local)

```bash
specify extension add ./ruta/a/quality --dev
```

## Actualización de la extensión

```bash
specify extension add ./ruta/a/quality --dev --force
```
