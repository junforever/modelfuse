[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$CommandArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDirectory = $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptDirectory
$configPath = Join-Path $scriptDirectory 'runtime.local.json'

if (-not (Test-Path -LiteralPath $configPath)) {
    throw 'Runtime no inicializado. Ejecuta .\agent-scripts\initialize-runtime.ps1 antes de delegar trabajo.'
}

try {
    $runtime = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
}
catch {
    throw 'runtime.local.json no es válido. Ejecuta .\agent-scripts\initialize-runtime.ps1 -Force.'
}

$nodePath = Join-Path $runtime.nodeDir 'node.exe'
if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $runtime.pnpmCmd)) {
    throw 'El runtime guardado ya no existe. Ejecuta .\agent-scripts\initialize-runtime.ps1 -Force.'
}
if (-not $CommandArgs -or $CommandArgs.Count -eq 0) {
    throw 'Faltan argumentos de pnpm.'
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
