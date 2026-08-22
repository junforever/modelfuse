[CmdletBinding()]
param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDirectory = $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptDirectory
$configPath = Join-Path $scriptDirectory 'runtime.local.json'

function Resolve-ToolPath {
    param(
        [Parameter(Mandatory)]
        [string[]]$Names
    )

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $command) {
            continue
        }

        $path = if ($command.Source) { $command.Source } else { $command.Path }
        if ($path -and (Test-Path -LiteralPath $path)) {
            return (Get-Item -LiteralPath $path).FullName
        }
    }

    return $null
}

$runtimeDependencies = $env:MODELFUSE_RUNTIME_ROOT
if (-not $runtimeDependencies -and $env:USERPROFILE) {
    $runtimeDependencies = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
}

$nodePath = $env:MODELFUSE_NODE_EXE
if (-not $nodePath -and $env:MODELFUSE_NODE_DIR) {
    $nodePath = Join-Path $env:MODELFUSE_NODE_DIR 'node.exe'
}
if (-not $nodePath -and $runtimeDependencies) {
    $candidate = Join-Path $runtimeDependencies 'node\bin\node.exe'
    if (Test-Path -LiteralPath $candidate) {
        $nodePath = $candidate
    }
}
if (-not $nodePath) {
    $nodePath = Resolve-ToolPath -Names @('node.exe', 'node')
}

$pnpmPath = $env:MODELFUSE_PNPM_CMD
if (-not $pnpmPath -and $runtimeDependencies) {
    $candidate = Join-Path $runtimeDependencies 'bin\fallback\pnpm.cmd'
    if (Test-Path -LiteralPath $candidate) {
        $pnpmPath = $candidate
    }
}
if (-not $pnpmPath) {
    $pnpmPath = Resolve-ToolPath -Names @('pnpm.cmd', 'pnpm')
}

if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath)) {
    throw 'Node no encontrado. Define MODELFUSE_RUNTIME_ROOT, MODELFUSE_NODE_EXE o MODELFUSE_NODE_DIR.'
}
if (-not $pnpmPath -or -not (Test-Path -LiteralPath $pnpmPath)) {
    throw 'pnpm no encontrado. Define MODELFUSE_RUNTIME_ROOT o MODELFUSE_PNPM_CMD.'
}

$nodePath = (Get-Item -LiteralPath $nodePath).FullName
$pnpmPath = (Get-Item -LiteralPath $pnpmPath).FullName
$nodeVersion = (& $nodePath --version).Trim()
$pnpmVersion = (& $pnpmPath --version).Trim()

$packagePath = Join-Path $repoRoot 'package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$nodeMajor = [int]([regex]::Match($nodeVersion, '^v?(\d+)').Groups[1].Value)
$requiredNodeMatch = [regex]::Match([string]$package.engines.node, '(\d+)')
if ($requiredNodeMatch.Success -and $nodeMajor -lt [int]$requiredNodeMatch.Groups[1].Value) {
    throw "Node $nodeVersion no cumple el mínimo $($package.engines.node)."
}

$pnpmMajor = [int]([regex]::Match($pnpmVersion, '^(\d+)').Groups[1].Value)
$requiredPnpmMatch = [regex]::Match([string]$package.packageManager, 'pnpm@(\d+)')
if ($requiredPnpmMatch.Success -and $pnpmMajor -ne [int]$requiredPnpmMatch.Groups[1].Value) {
    throw "pnpm $pnpmVersion no coincide con $($package.packageManager)."
}

$nodeDirectory = Split-Path -Parent $nodePath
$existing = $null
if (-not $Force -and (Test-Path -LiteralPath $configPath)) {
    try {
        $existing = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    }
    catch {
        $existing = $null
    }
}

if ($existing -and
    $existing.nodeDir -eq $nodeDirectory -and
    $existing.pnpmCmd -eq $pnpmPath -and
    $existing.nodeVersion -eq $nodeVersion -and
    $existing.pnpmVersion -eq $pnpmVersion) {
    Write-Output "Runtime ya inicializado: Node $nodeVersion, pnpm $pnpmVersion."
    exit 0
}

$runtime = [ordered]@{
    nodeDir = $nodeDirectory
    pnpmCmd = $pnpmPath
    nodeVersion = $nodeVersion
    pnpmVersion = $pnpmVersion
}
$temporaryPath = "$configPath.$PID.tmp"
try {
    $runtime | ConvertTo-Json | Set-Content -LiteralPath $temporaryPath -Encoding utf8
    Move-Item -LiteralPath $temporaryPath -Destination $configPath -Force
}
finally {
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }
}

Write-Output "Runtime inicializado: Node $nodeVersion, pnpm $pnpmVersion."
