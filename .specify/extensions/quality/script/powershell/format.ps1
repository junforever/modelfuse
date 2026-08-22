# ============================================================
# Quality Gate: Formateo con Prettier
# Valida instalación de Prettier, valida configuración,
# y formatea el código del proyecto.
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  Quality Gate: Prettier Format"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

# ------------------------------------------------------------
# 1. Validar que Prettier esté instalado
# ------------------------------------------------------------
Write-Host "🔍 Verificando instalación de Prettier..."

$prettierCmd = $null

if (Test-Path "node_modules/.bin/prettier") {
    $prettierCmd = "node_modules/.bin/prettier"
} elseif (Get-Command "prettier" -ErrorAction SilentlyContinue) {
    $prettierCmd = "prettier"
} else {
    try {
        $null = npx --no-install prettier --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $prettierCmd = "npx --no-install prettier"
        }
    } catch {
        # npx no disponible o prettier no encontrado
    }
}

if (-not $prettierCmd) {
    Write-Host ""
    Write-Host "❌ ERROR: Prettier no está instalado en este proyecto." -ForegroundColor Red
    Write-Host ""
    Write-Host "   Instálalo como dependencia de desarrollo:"
    Write-Host ""
    Write-Host "   npm install --save-dev prettier"
    Write-Host "   pnpm add --save-dev prettier"
    Write-Host "   yarn add --dev prettier"
    Write-Host "   bun add --dev prettier"
    Write-Host ""
    Write-Host "⛔ Abortando formateo." -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Prettier detectado: $prettierCmd"
Write-Host ""

# ------------------------------------------------------------
# 2. Validar que exista archivo de configuración de Prettier
# ------------------------------------------------------------
Write-Host "🔍 Verificando archivo de configuración de Prettier..."

$configFile = $null

$configCandidates = @(
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.yml",
    ".prettierrc.yaml",
    ".prettierrc.js",
    ".prettierrc.cjs",
    ".prettierrc.mjs",
    "prettier.config.js",
    "prettier.config.cjs",
    "prettier.config.mjs"
)

foreach ($candidate in $configCandidates) {
    if (Test-Path $candidate) {
        $configFile = $candidate
        break
    }
}

# Verificar si package.json tiene la clave "prettier" a nivel raíz
if (-not $configFile -and (Test-Path "package.json")) {
    try {
        $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
        if ($packageJson.PSObject.Properties.Name -contains "prettier") {
            $configFile = 'package.json (clave "prettier")'
        }
    } catch {
        # package.json no válido, ignorar
    }
}

if (-not $configFile) {
    Write-Host ""
    Write-Host "❌ ERROR: No se encontró un archivo de configuración de Prettier." -ForegroundColor Red
    Write-Host ""
    Write-Host "   Debes definir la configuración de Prettier antes de formatear."
    Write-Host "   Crea un archivo de configuración válido en la raíz del proyecto."
    Write-Host ""
    Write-Host "⛔ Abortando formateo." -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Configuración detectada: $configFile"
Write-Host ""

# ------------------------------------------------------------
# 3. Ejecutar formateo
# ------------------------------------------------------------
Write-Host "🧹 Formateando código con Prettier..."
Write-Host ""

$ignoreArgs = @()
if (Test-Path ".prettierignore") {
    $ignoreArgs = @("--ignore-path", ".prettierignore")
    Write-Host "   Usando .prettierignore"
}

if ($prettierCmd -match "^npx") {
    $parts = $prettierCmd -split " "
    & $parts[0] $parts[1..($parts.Length-1)] --write . @ignoreArgs
} else {
    & $prettierCmd --write . @ignoreArgs
}

$formatStatus = $LASTEXITCODE

Write-Host ""

if ($formatStatus -ne 0) {
    Write-Host "❌ ERROR: Prettier encontró problemas durante el formateo." -ForegroundColor Red
    Write-Host "⛔ Revisa los errores anteriores." -ForegroundColor Red
    exit $formatStatus
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  ✅ Formateo completado correctamente." -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"