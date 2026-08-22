$ErrorActionPreference = 'Stop'

function Resolve-RepositoryRoot {
    $candidate = (Get-Location).ProviderPath
    try {
        $gitRoot = (& git -C $candidate rev-parse --show-toplevel 2>$null).Trim()
        if ($LASTEXITCODE -eq 0 -and $gitRoot) {
            return $gitRoot
        }
    }
    catch {
        # Keep the caller's working directory when Git is unavailable.
    }

    return $candidate
}

function Find-PrettierCommand {
    $candidates = @(
        (Join-Path $repoRoot 'node_modules/.bin/prettier.cmd'),
        (Join-Path $repoRoot 'node_modules/.bin/prettier.CMD'),
        (Join-Path $repoRoot 'node_modules/.bin/prettier.ps1'),
        (Join-Path $repoRoot 'node_modules/.bin/prettier')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    $global = Get-Command prettier -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $global) {
        if ($global.Source) {
            return $global.Source
        }
        return $global.Path
    }

    return $null
}

function Find-PrettierConfig {
    $configCandidates = @(
        '.prettierrc',
        '.prettierrc.json',
        '.prettierrc.yml',
        '.prettierrc.yaml',
        '.prettierrc.js',
        '.prettierrc.cjs',
        '.prettierrc.mjs',
        'prettier.config.js',
        'prettier.config.cjs',
        'prettier.config.mjs'
    )

    foreach ($candidate in $configCandidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    if (Test-Path -LiteralPath 'package.json') {
        try {
            $packageJson = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
            if ($packageJson.PSObject.Properties.Name -contains 'prettier') {
                return 'package.json (prettier property)'
            }
        }
        catch {
            return $null
        }
    }

    return $null
}

$repoRoot = Resolve-RepositoryRoot
$wrapper = Join-Path $repoRoot 'agent-scripts/run-pnpm.ps1'
$prettierCommand = $null
$useRuntimeWrapper = Test-Path -LiteralPath $wrapper

Push-Location $repoRoot
try {
    Write-Host ''
    Write-Host 'Quality Gate: Prettier Format'
    Write-Host ''
    Write-Host 'Checking Prettier installation...'

    if ($useRuntimeWrapper) {
        & $wrapper exec prettier --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw 'The repository pnpm runtime wrapper could not execute Prettier.'
        }
        Write-Host 'Prettier detected through agent-scripts/run-pnpm.ps1.'
    }
    else {
        $prettierCommand = Find-PrettierCommand
        if (-not $prettierCommand) {
            throw 'Prettier is not installed in the project.'
        }
        Write-Host "Prettier detected: $prettierCommand"
    }

    Write-Host 'Checking Prettier configuration...'
    $configFile = Find-PrettierConfig
    if (-not $configFile) {
        throw 'No Prettier configuration file was found at the repository root.'
    }
    Write-Host "Configuration detected: $configFile"

    $formatArguments = @('--write', '.')
    if (Test-Path -LiteralPath '.prettierignore') {
        $formatArguments += @('--ignore-path', '.prettierignore')
        Write-Host 'Using .prettierignore.'
    }

    Write-Host 'Formatting with Prettier...'
    if ($useRuntimeWrapper) {
        & $wrapper exec prettier @formatArguments
    }
    else {
        & $prettierCommand @formatArguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Prettier exited with status $LASTEXITCODE."
    }

    Write-Host 'Prettier formatting completed successfully.'
    exit 0
}
catch {
    Write-Error $_
    exit 1
}
finally {
    Pop-Location
}
