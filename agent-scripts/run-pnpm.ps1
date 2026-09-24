[CmdletBinding()]
param(
    [string]$EnvFile,
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$CommandArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDirectory = $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptDirectory
$configPath = Join-Path $scriptDirectory 'runtime.local.json'

function Format-Command {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $formatted = $Arguments | ForEach-Object {
        $argument = [string]$_
        if ($argument -match '[\s"]') {
            '"' + $argument.Replace('"', '\\"') + '"'
        }
        else {
            $argument
        }
    }

    return 'pnpm ' + ($formatted -join ' ')
}

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Runtime no inicializado.`nConfig esperada: $configPath`nAcción: ejecutar .\agent-scripts\initialize-runtime.ps1."
}

try {
    $runtime = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
}
catch {
    throw "runtime.local.json no es válido.`nConfig: $configPath`nExcepción: $($_.Exception.Message)`nAcción: ejecutar initialize-runtime.ps1."
}

$requiredProperties = @('nodeExe', 'nodeDir', 'pnpmCmd', 'nodeVersion', 'pnpmVersion')
$missingProperties = @($requiredProperties | Where-Object { $null -eq $runtime.PSObject.Properties[$_] })
if ($missingProperties.Count -gt 0) {
    throw "runtime.local.json está obsoleto; faltan: $($missingProperties -join ', '). El coordinador debe ejecutar initialize-runtime.ps1."
}

if (-not (Test-Path -LiteralPath $runtime.nodeExe) -or
    -not (Test-Path -LiteralPath $runtime.pnpmCmd) -or
    -not (Test-Path -LiteralPath (Join-Path $runtime.nodeDir 'node.exe'))) {
    throw "Las rutas del runtime ya no existen.`nNode: $($runtime.nodeExe)`nPnpm: $($runtime.pnpmCmd)`nNodeDir: $($runtime.nodeDir)`nAcción: ejecutar initialize-runtime.ps1. Usar -Force solo ante un reemplazo externo confirmado del runtime."
}

$actualNodeVersion = (& $runtime.nodeExe --version 2>$null).Trim()
$actualPnpmVersion = (& $runtime.pnpmCmd --version 2>$null).Trim()
if ($actualNodeVersion -ne $runtime.nodeVersion -or $actualPnpmVersion -ne $runtime.pnpmVersion) {
    throw "Las versiones del runtime cambiaron.`nNode esperado/actual: $($runtime.nodeVersion) / $actualNodeVersion`nPnpm esperado/actual: $($runtime.pnpmVersion) / $actualPnpmVersion`nAcción: restaurar el runtime esperado; ejecutar initialize-runtime.ps1 -Force solo después de confirmar un reemplazo externo del runtime."
}
if (-not $CommandArgs -or $CommandArgs.Count -eq 0) {
    throw 'Faltan argumentos de pnpm.`nUso: .\agent-scripts\run-pnpm.ps1 [opciones] -- <argumentos de pnpm>.'
}

# The first `--` is the PowerShell end-of-parameters marker for this wrapper.
# Everything after it is a literal pnpm argument list; later `--` tokens are
# retained because they belong to pnpm or to the invoked command.
if ($CommandArgs[0] -eq '--') {
    $CommandArgs = @($CommandArgs | Select-Object -Skip 1)
    if ($CommandArgs.Count -eq 0) {
        throw 'El separador `--` debe ir seguido de argumentos de pnpm.`nComando recibido: .\agent-scripts\run-pnpm.ps1 --'
    }
}

if ($EnvFile) {
    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw "No existe el archivo de entorno indicado: $EnvFile."
    }

    $lineNumber = 0
    foreach ($line in Get-Content -LiteralPath $EnvFile) {
        $lineNumber++
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            throw "Línea inválida en el archivo de entorno.`nArchivo: $EnvFile`nLínea: $lineNumber`nAcción: corregir el formato NOMBRE=VALOR sin exponer el valor en el reporte."
        }

        $name = $Matches[1]
        $value = $Matches[2].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

$pnpmDirectory = Split-Path -Parent $runtime.pnpmCmd
$env:Path = "$($runtime.nodeDir);$pnpmDirectory;$env:Path"

Push-Location $repoRoot
try {
    & $runtime.pnpmCmd @CommandArgs
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($exitCode -ne 0) {
    [Console]::Error.WriteLine("RUN_PNPM_FAILURE`nComando: $(Format-Command -Arguments $CommandArgs)`nExitCode: $exitCode`nEnvFile: $EnvFile")
}

exit $exitCode
