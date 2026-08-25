[CmdletBinding()]
param(
    [string]$ComposeFile = 'docker-compose.integration.yml',
    [string]$ProjectName = 'modelfuse-integration',
    [string]$EnvFile = 'apps/backend/.env.integration',
    [string]$PostgresService = 'postgres_integration',
    [string]$LiquibaseService = 'liquibase_integration'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Stop-WithBlocker {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('BLOQUEO_DOCKER', 'BLOQUEO_INTEGRATION_ENV')]
        [string]$Code,
        [Parameter(Mandatory)]
        [string]$Message
    )

    throw "$Code`n$Message"
}

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

    return 'docker ' + ($formatted -join ' ')
}

function Invoke-DockerChecked {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [Parameter(Mandatory)]
        [ValidateSet('BLOQUEO_DOCKER', 'BLOQUEO_INTEGRATION_ENV')]
        [string]$FailureCode
    )

    $stderrPath = [System.IO.Path]::GetTempFileName()
    $commandText = Format-Command -Arguments $Arguments
    try {
        $output = @(& docker @Arguments 2> $stderrPath)
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            $stderr = if (Test-Path -LiteralPath $stderrPath) {
                (Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue).Trim()
            }
            else {
                ''
            }
            $stdout = (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
            $details = @(
                "Comando: $commandText"
                "ExitCode: $exitCode"
            )
            if ($stdout) { $details += "Stdout: $stdout" }
            if ($stderr) { $details += "Stderr: $stderr" }
            Stop-WithBlocker -Code $FailureCode -Message ($details -join "`n")
        }

        return $output
    }
    catch {
        if ($_.Exception.Message -match '^(BLOQUEO_DOCKER|BLOQUEO_INTEGRATION_ENV)') {
            throw
        }

        Stop-WithBlocker -Code $FailureCode -Message "Comando: $commandText`nExcepción: $($_.Exception.Message)"
    }
    finally {
        if (Test-Path -LiteralPath $stderrPath) {
            Remove-Item -LiteralPath $stderrPath -Force
        }
    }
}

function Get-EnvFileValue {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Name
    )

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }

    return $null
}

function Get-ServiceRow {
    param(
        [Parameter(Mandatory)]
        [object[]]$Rows,
        [Parameter(Mandatory)]
        [string]$Service
    )

    $row = @($Rows | Where-Object { $_.Service -eq $Service })
    if ($row.Count -ne 1) {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message "El servicio Compose requerido no tiene una instancia única: $Service."
    }

    return $row[0]
}

$composePath = $null
$envPath = $null

try {
    if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message "No existe el Compose de integración: $ComposeFile."
    }

    $composePath = (Resolve-Path -LiteralPath $ComposeFile).Path
    if ($EnvFile) {
        if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
            Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message "No existe el archivo de entorno indicado para integración."
        }

        $envPath = (Resolve-Path -LiteralPath $EnvFile).Path
        [System.Environment]::SetEnvironmentVariable('MODELFUSE_TEST_ENV_FILE', $envPath, 'Process')
    }

    $databaseUrl = $env:MODELFUSE_TEST_DATABASE_URL
    if (-not $databaseUrl -and $envPath) {
        $databaseUrl = Get-EnvFileValue -Path $envPath -Name 'MODELFUSE_TEST_DATABASE_URL'
    }
    if (-not $databaseUrl) {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'MODELFUSE_TEST_DATABASE_URL no está configurada.'
    }

    try {
        $databaseUri = [Uri]$databaseUrl
    }
    catch {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'MODELFUSE_TEST_DATABASE_URL no es una URL válida.'
    }

    if ($databaseUri.Scheme -notin @('postgres', 'postgresql') -or $databaseUri.Host -notin @('localhost', '127.0.0.1', '::1')) {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'La base de integración debe ser PostgreSQL en loopback.'
    }

    $databaseName = $databaseUri.AbsolutePath.Trim('/')
    if (-not $databaseName -or $databaseName -notmatch '(?i)test') {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'El nombre de la base de integración debe contener "test".'
    }

    [void](Invoke-DockerChecked -Arguments @('info', '--format', '{{.ServerVersion}}') -FailureCode 'BLOQUEO_DOCKER')
    [void](Invoke-DockerChecked -Arguments @('compose', 'version') -FailureCode 'BLOQUEO_DOCKER')

    $composePrefix = @('compose', '--project-name', $ProjectName, '--file', $composePath)
    if ($envPath) {
        $composePrefix += @('--env-file', $envPath)
    }

    [void](Invoke-DockerChecked -Arguments ($composePrefix + @('config', '--quiet')) -FailureCode 'BLOQUEO_INTEGRATION_ENV')

    $rowsOutput = Invoke-DockerChecked -Arguments ($composePrefix + @('ps', '-a', '--format', 'json')) -FailureCode 'BLOQUEO_INTEGRATION_ENV'
    $rowsJson = ($rowsOutput -join "`n").Trim()
    if (-not $rowsJson) {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'El proyecto Compose de integración no tiene servicios creados.'
    }

    try {
        $serviceRows = @(
            foreach ($row in $rowsOutput) {
                $rowText = ([string]$row).Trim()
                if ($rowText) {
                    $rowText | ConvertFrom-Json
                }
            }
        )
    }
    catch {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message "No se pudo interpretar el estado seguro de los servicios Compose. Detalle: $($_.Exception.Message)"
    }

    $postgres = Get-ServiceRow -Rows $serviceRows -Service $PostgresService
    if ([string]$postgres.Health -ne 'healthy') {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'PostgreSQL no está healthy.'
    }

    $liquibase = Get-ServiceRow -Rows $serviceRows -Service $LiquibaseService
    if ([string]$liquibase.State -ne 'exited' -or [int]$liquibase.ExitCode -ne 0) {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'Liquibase no terminó correctamente.'
    }

    $publishedPortOutput = Invoke-DockerChecked -Arguments ($composePrefix + @('port', $PostgresService, '5432')) -FailureCode 'BLOQUEO_INTEGRATION_ENV'
    $publishedPort = [regex]::Match(($publishedPortOutput -join "`n"), ':(\d+)\s*$')
    if (-not $publishedPort.Success -or [int]$publishedPort.Groups[1].Value -ne $databaseUri.Port) {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'El puerto publicado de PostgreSQL no coincide con MODELFUSE_TEST_DATABASE_URL.'
    }

    $schemaQuery = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT current_database() || '':'' || CASE WHEN COUNT(*) = 4 THEN ''ready'' ELSE ''missing'' END FROM pg_catalog.pg_tables WHERE schemaname = ''public'' AND tablename IN (''conversations'', ''conversation_deployments'', ''turns'', ''model_responses'');"'
    $schemaOutput = Invoke-DockerChecked -Arguments ($composePrefix + @('exec', '-T', $PostgresService, 'sh', '-lc', $schemaQuery)) -FailureCode 'BLOQUEO_INTEGRATION_ENV'
    if (($schemaOutput -join '').Trim() -ne "$databaseName`:ready") {
        Stop-WithBlocker -Code 'BLOQUEO_INTEGRATION_ENV' -Message 'El schema ModelFuse requerido no está listo.'
    }

    Write-Output 'INTEGRATION_PREFLIGHT_OK'
    Write-Output "Compose: $ComposeFile"
    Write-Output "Project: $ProjectName"
    Write-Output "PostgreSQL: healthy ($PostgresService)"
    Write-Output "Liquibase: exited(0) ($LiquibaseService)"
    Write-Output "Database: loopback / $databaseName"
    Write-Output "Port: $($databaseUri.Port)"
    Write-Output 'Schema: ready'
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
