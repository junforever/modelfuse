#!/usr/bin/env bash
set -o pipefail

# ============================================================
# Quality Gate: Formateo con Prettier
# Valida instalación de Prettier, valida configuración,
# y formatea el código del proyecto.
# ============================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Quality Gate: Prettier Format"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ------------------------------------------------------------
# 1. Validar que Prettier esté instalado
# ------------------------------------------------------------
echo "🔍 Verificando instalación de Prettier..."

PRETTIER_CMD=""

if [ -x "node_modules/.bin/prettier" ]; then
    PRETTIER_CMD="node_modules/.bin/prettier"
elif command -v prettier >/dev/null 2>&1; then
    PRETTIER_CMD="prettier"
elif npx --no-install prettier --version >/dev/null 2>&1; then
    PRETTIER_CMD="npx --no-install prettier"
fi

if [ -z "$PRETTIER_CMD" ]; then
    echo ""
    echo "❌ ERROR: Prettier no está instalado en este proyecto."
    echo ""
    echo "   Instálalo como dependencia de desarrollo:"
    echo ""
    echo "   npm install --save-dev prettier"
    echo "   pnpm add --save-dev prettier"
    echo "   yarn add --dev prettier"
    echo "   bun add --dev prettier"
    echo ""
    echo "⛔ Abortando formateo."
    exit 1
fi

echo "   ✅ Prettier detectado: $PRETTIER_CMD"
echo ""

# ------------------------------------------------------------
# 2. Validar que exista archivo de configuración de Prettier
# ------------------------------------------------------------
echo "🔍 Verificando archivo de configuración de Prettier..."

CONFIG_FILE=""

for candidate in \
    .prettierrc \
    .prettierrc.json \
    .prettierrc.yml \
    .prettierrc.yaml \
    .prettierrc.js \
    .prettierrc.cjs \
    .prettierrc.mjs \
    prettier.config.js \
    prettier.config.cjs \
    prettier.config.mjs
do
    if [ -f "$candidate" ]; then
        CONFIG_FILE="$candidate"
        break
    fi
done

# Verificar si package.json tiene la clave "prettier" a nivel raíz
if [ -z "$CONFIG_FILE" ] && [ -f package.json ]; then
    if node -e '
        const pkg = require("./package.json");
        process.exit(Object.prototype.hasOwnProperty.call(pkg, "prettier") ? 0 : 1);
    ' 2>/dev/null; then
        CONFIG_FILE="package.json (clave \"prettier\")"
    fi
fi

if [ -z "$CONFIG_FILE" ]; then
    echo ""
    echo "❌ ERROR: No se encontró un archivo de configuración de Prettier."
    echo ""
    echo "   Debes definir la configuración de Prettier antes de formatear."
    echo "   Crea un archivo de configuración válido en la raíz del proyecto."
    echo ""
    echo "⛔ Abortando formateo."
    exit 1
fi

echo "   ✅ Configuración detectada: $CONFIG_FILE"
echo ""

# ------------------------------------------------------------
# 3. Ejecutar formateo
# ------------------------------------------------------------
echo "🧹 Formateando código con Prettier..."
echo ""

IGNORE_ARGS=""
if [ -f .prettierignore ]; then
    IGNORE_ARGS="--ignore-path .prettierignore"
    echo "   Usando .prettierignore"
fi

$PRETTIER_CMD --write . $IGNORE_ARGS
FORMAT_STATUS=$?

echo ""

if [ $FORMAT_STATUS -ne 0 ]; then
    echo "❌ ERROR: Prettier encontró problemas durante el formateo."
    echo "⛔ Revisa los errores anteriores."
    exit $FORMAT_STATUS
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Formateo completado correctamente."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"