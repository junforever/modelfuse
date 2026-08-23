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

if (-not (Test-Path -LiteralPath $configPath)) {
    throw 'Runtime no inicializado. El coordinador debe ejecutar .\agent-scripts\initialize-runtime.ps1.'
}

try {
    $runtime = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
}
catch {
    throw 'runtime.local.json no es válido. El coordinador debe ejecutar initialize-runtime.ps1.'
}

$requiredProperties = @('nodeExe', 'nodeDir', 'pnpmCmd', 'nodeVersion', 'pnpmVersion')
$missingProperties = @($requiredProperties | Where-Object { $null -eq $runtime.PSObject.Properties[$_] })
if ($missingProperties.Count -gt 0) {
    throw "runtime.local.json está obsoleto; faltan: $($missingProperties -join ', '). El coordinador debe ejecutar initialize-runtime.ps1."
}

if (-not (Test-Path -LiteralPath $runtime.nodeExe) -or
    -not (Test-Path -LiteralPath $runtime.pnpmCmd) -or
    -not (Test-Path -LiteralPath (Join-Path $runtime.nodeDir 'node.exe'))) {
    throw 'Las rutas del runtime ya no existen. El coordinador debe ejecutar initialize-runtime.ps1 -Force.'
}

$actualNodeVersion = (& $runtime.nodeExe --version 2>$null).Trim()
$actualPnpmVersion = (& $runtime.pnpmCmd --version 2>$null).Trim()
if ($actualNodeVersion -ne $runtime.nodeVersion -or $actualPnpmVersion -ne $runtime.pnpmVersion) {
    throw 'Las versiones del runtime cambiaron. El coordinador debe ejecutar initialize-runtime.ps1 -Force.'
}
if (-not $CommandArgs -or $CommandArgs.Count -eq 0) {
    throw 'Faltan argumentos de pnpm.'
}

if ($EnvFile) {
    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw "No existe el archivo de entorno indicado: $EnvFile."
    }

    foreach ($line in Get-Content -LiteralPath $EnvFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            throw "Línea inválida en el archivo de entorno: $EnvFile."
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

exit $exitCode
