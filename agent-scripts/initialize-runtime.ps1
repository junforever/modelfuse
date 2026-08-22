[CmdletBinding()]
param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDirectory = $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptDirectory
$configPath = Join-Path $scriptDirectory 'runtime.local.json'
$packagePath = Join-Path $repoRoot 'package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json

function Get-ConfigProperty {
    param(
        [object]$Config,
        [Parameter(Mandatory)]
        [string]$Name
    )

    if ($null -eq $Config) {
        return $null
    }

    $property = $Config.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }

    return [string]$property.Value
}

function Get-ToolVersion {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        $output = & $Path --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            return $null
        }

        $version = ($output -join "`n").Trim()
        if ($version) {
            return $version
        }
    }
    catch {
        return $null
    }

    return $null
}

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

function Add-Candidate {
    param(
        [AllowEmptyCollection()]
        [Parameter(Mandatory)]
        [System.Collections.Generic.List[string]]$Candidates,
        [string]$Path
    )

    if ($Path -and (Test-Path -LiteralPath $Path) -and -not $Candidates.Contains($Path)) {
        [void]$Candidates.Add((Get-Item -LiteralPath $Path).FullName)
    }
}

function Select-Node {
    param(
        [AllowEmptyCollection()]
        [Parameter(Mandatory)]
        [System.Collections.Generic.List[string]]$Candidates,
        [Parameter(Mandatory)]
        [int]$MinimumMajor
    )

    foreach ($path in $Candidates) {
        $version = Get-ToolVersion -Path $path
        $match = [regex]::Match([string]$version, '^v?(\d+)')
        if ($match.Success -and [int]$match.Groups[1].Value -ge $MinimumMajor) {
            return [pscustomobject]@{ Path = $path; Version = $version }
        }
    }

    throw "No se encontró un Node.js válido (mínimo: $($package.engines.node))."
}

function Select-Pnpm {
    param(
        [AllowEmptyCollection()]
        [Parameter(Mandatory)]
        [System.Collections.Generic.List[string]]$Candidates,
        [Parameter(Mandatory)]
        [string]$RequiredVersion
    )

    $detected = [System.Collections.Generic.List[string]]::new()
    foreach ($path in $Candidates) {
        $version = Get-ToolVersion -Path $path
        if ($version) {
            [void]$detected.Add("$version ($path)")
        }
        if ($version -eq $RequiredVersion) {
            return [pscustomobject]@{ Path = $path; Version = $version }
        }
    }

    $available = if ($detected.Count -gt 0) { $detected -join '; ' } else { 'ninguna ruta candidata válida' }
    throw "No se encontró pnpm $RequiredVersion. Candidatos inspeccionados: $available."
}

$requiredNodeMatch = [regex]::Match([string]$package.engines.node, '(\d+)')
$requiredNodeMajor = if ($requiredNodeMatch.Success) { [int]$requiredNodeMatch.Groups[1].Value } else { 0 }
$requiredPnpmMatch = [regex]::Match([string]$package.packageManager, '^pnpm@(\d+\.\d+\.\d+)$')
if (-not $requiredPnpmMatch.Success) {
    throw "package.json debe declarar una versión exacta con packageManager=pnpm@x.y.z."
}
$requiredPnpmVersion = $requiredPnpmMatch.Groups[1].Value

$existing = $null
if (Test-Path -LiteralPath $configPath) {
    try {
        $existing = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    }
    catch {
        $existing = $null
    }
}

$runtimeDependencies = $env:MODELFUSE_RUNTIME_ROOT
if (-not $runtimeDependencies -and $env:USERPROFILE) {
    $runtimeDependencies = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
}

$nodeCandidates = [System.Collections.Generic.List[string]]::new()
$pnpmCandidates = [System.Collections.Generic.List[string]]::new()

if (-not $Force) {
    $existingNodeExe = Get-ConfigProperty -Config $existing -Name 'nodeExe'
    if (-not $existingNodeExe) {
        $existingNodeDir = Get-ConfigProperty -Config $existing -Name 'nodeDir'
        if ($existingNodeDir) {
            $existingNodeExe = Join-Path $existingNodeDir 'node.exe'
        }
    }
    Add-Candidate -Candidates $nodeCandidates -Path $existingNodeExe
    Add-Candidate -Candidates $pnpmCandidates -Path (Get-ConfigProperty -Config $existing -Name 'pnpmCmd')
}

$nodePath = $env:MODELFUSE_NODE_EXE
if (-not $nodePath -and $env:MODELFUSE_NODE_DIR) {
    $nodePath = Join-Path $env:MODELFUSE_NODE_DIR 'node.exe'
}
Add-Candidate -Candidates $nodeCandidates -Path $nodePath

$pnpmPath = $env:MODELFUSE_PNPM_CMD
Add-Candidate -Candidates $pnpmCandidates -Path $pnpmPath

if ($runtimeDependencies) {
    Add-Candidate -Candidates $nodeCandidates -Path (Join-Path $runtimeDependencies 'node\bin\node.exe')
    Add-Candidate -Candidates $pnpmCandidates -Path (Join-Path $runtimeDependencies 'bin\fallback\pnpm.cmd')
}

Add-Candidate -Candidates $nodeCandidates -Path (Resolve-ToolPath -Names @('node.exe', 'node'))
Add-Candidate -Candidates $pnpmCandidates -Path (Resolve-ToolPath -Names @('pnpm.cmd', 'pnpm'))

$node = Select-Node -Candidates $nodeCandidates -MinimumMajor $requiredNodeMajor
$pnpm = Select-Pnpm -Candidates $pnpmCandidates -RequiredVersion $requiredPnpmVersion
$nodeDirectory = Split-Path -Parent $node.Path

$existingMatches =
    $existing -and
    (Get-ConfigProperty -Config $existing -Name 'nodeExe') -eq $node.Path -and
    (Get-ConfigProperty -Config $existing -Name 'nodeDir') -eq $nodeDirectory -and
    (Get-ConfigProperty -Config $existing -Name 'pnpmCmd') -eq $pnpm.Path -and
    (Get-ConfigProperty -Config $existing -Name 'nodeVersion') -eq $node.Version -and
    (Get-ConfigProperty -Config $existing -Name 'pnpmVersion') -eq $pnpm.Version

if ($existingMatches) {
    Write-Output "Runtime ya inicializado: Node $($node.Version), pnpm $($pnpm.Version)."
    exit 0
}

$runtime = [ordered]@{
    nodeExe = $node.Path
    nodeDir = $nodeDirectory
    pnpmCmd = $pnpm.Path
    nodeVersion = $node.Version
    pnpmVersion = $pnpm.Version
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

Write-Output "Runtime inicializado: Node $($node.Version), pnpm $($pnpm.Version)."
