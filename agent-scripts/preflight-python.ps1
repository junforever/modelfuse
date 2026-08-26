[CmdletBinding()]
param(
    [string]$PythonCommand,
    [string]$MinimumVersion,
    [string[]]$RequiredModule = @(),
    [string]$WorkingDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDirectory = $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptDirectory

function Format-Command {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $formatted = @($Path) + @($Arguments) | ForEach-Object {
        $argument = [string]$_
        if ($argument -match '[\s"]') {
            '"' + $argument.Replace('"', '\\"') + '"'
        }
        else {
            $argument
        }
    }

    return $formatted -join ' '
}

function Get-TrimmedText {
    param(
        [AllowNull()]
        [object]$Value
    )

    if ($null -eq $Value) {
        return ''
    }

    return ([string]$Value).Trim()
}

function Stop-Preflight {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('BLOQUEO_RUNTIME', 'BLOQUEO_PYTHON_ENV')]
        [string]$Code,
        [Parameter(Mandatory)]
        [string]$Message,
        [string]$Command = 'no_disponible',
        [string]$Stdout = '',
        [string]$Stderr = '',
        [int]$ExitCode = -1
    )

    $details = @(
        $Code
        "Perfil: Python"
        "Comando: $Command"
        "ExitCode: $ExitCode"
        "Mensaje: $Message"
    )
    if ($Stdout) { $details += "Stdout: $Stdout" }
    if ($Stderr) { $details += "Stderr: $Stderr" }

    [Console]::Error.WriteLine($details -join "`n")
    exit 1
}

function Add-Candidate {
    param(
        [AllowEmptyCollection()]
        [Parameter(Mandatory)]
        [System.Collections.Generic.List[string]]$Candidates,
        [string]$Path
    )

    if (-not $Path) {
        return
    }

    $resolvedPath = $Path
    if (-not [System.IO.Path]::IsPathRooted($resolvedPath)) {
        $commands = @(Get-Command $resolvedPath -All -ErrorAction SilentlyContinue)
        if ($commands.Count -eq 0) {
            return
        }

        foreach ($command in $commands) {
            $commandPath = if ($command.Source) { $command.Source } else { $command.Path }
            if ($commandPath -and (Test-Path -LiteralPath $commandPath -PathType Leaf)) {
                $fullPath = (Get-Item -LiteralPath $commandPath).FullName
                if (-not $Candidates.Contains($fullPath)) {
                    [void]$Candidates.Add($fullPath)
                }
            }
        }
        return
    }

    if ($resolvedPath -and (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        $fullPath = (Get-Item -LiteralPath $resolvedPath).FullName
        if (-not $Candidates.Contains($fullPath)) {
            [void]$Candidates.Add($fullPath)
        }
    }
}

function Invoke-Python {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $stderrPath = [System.IO.Path]::GetTempFileName()
    try {
        $output = @(& $Path @Arguments 2> $stderrPath)
        $exitCode = $LASTEXITCODE
        $stderr = if (Test-Path -LiteralPath $stderrPath) {
            Get-TrimmedText -Value (Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue)
        }
        else {
            ''
        }

        [pscustomobject]@{
            Command = Format-Command -Path $Path -Arguments $Arguments
            ExitCode = $exitCode
            Stdout = Get-TrimmedText -Value (($output | ForEach-Object { [string]$_ }) -join "`n")
            Stderr = $stderr
        }
    }
    catch {
        [pscustomobject]@{
            Command = Format-Command -Path $Path -Arguments $Arguments
            ExitCode = -1
            Stdout = ''
            Stderr = @(
                "ExceptionType: $($_.Exception.GetType().FullName)"
                "Exception: $($_.Exception.Message)"
                "ScriptStackTrace: $($_.ScriptStackTrace)"
            ) -join "`n"
        }
    }
    finally {
        if (Test-Path -LiteralPath $stderrPath) {
            Remove-Item -LiteralPath $stderrPath -Force
        }
    }
}

try {
    $candidates = [System.Collections.Generic.List[string]]::new()
    $requestedCommand = if ($PythonCommand) { $PythonCommand } else { $env:MODELFUSE_PYTHON_EXE }

    Add-Candidate -Candidates $candidates -Path $requestedCommand

    if ($env:MODELFUSE_RUNTIME_ROOT) {
        Add-Candidate -Candidates $candidates -Path (Join-Path $env:MODELFUSE_RUNTIME_ROOT 'python\python.exe')
        Add-Candidate -Candidates $candidates -Path (Join-Path $env:MODELFUSE_RUNTIME_ROOT 'python\bin\python.exe')
    }

    if (-not $requestedCommand) {
        Add-Candidate -Candidates $candidates -Path 'python.exe'
        Add-Candidate -Candidates $candidates -Path 'python3.exe'
        Add-Candidate -Candidates $candidates -Path 'python'
        Add-Candidate -Candidates $candidates -Path 'python3'
    }

    if ($candidates.Count -eq 0) {
        Stop-Preflight -Code 'BLOQUEO_RUNTIME' -Message 'No se encontró un ejecutable Python soportado.' -Command 'python --version'
    }

    $versionResult = $null
    $pythonPath = $null
    $probeResults = [System.Collections.Generic.List[object]]::new()
    foreach ($candidate in $candidates) {
        $probe = Invoke-Python -Path $candidate -Arguments @('--version')
        [void]$probeResults.Add($probe)
        $versionText = @($probe.Stdout, $probe.Stderr) | Where-Object { $_ } | Select-Object -First 1
        if ($probe.ExitCode -eq 0 -and $versionText -match '^Python\s+(\d+\.\d+\.\d+)') {
            $pythonPath = $candidate
            $versionResult = [pscustomobject]@{
                Version = $Matches[1]
                Text = $versionText
                Probe = $probe
            }
            break
        }
    }

    if ($null -eq $versionResult) {
        $candidateList = $candidates -join '; '
        $probeDetails = @(
            $probeResults | ForEach-Object {
                @(
                    "Command: $($_.Command)"
                    "ExitCode: $($_.ExitCode)"
                    "Stdout: $($_.Stdout)"
                    "Stderr: $($_.Stderr)"
                ) -join "`n"
            }
        ) -join "`n---`n"
        Stop-Preflight -Code 'BLOQUEO_RUNTIME' -Message "Los candidatos Python no pudieron ejecutar --version. Candidatos inspeccionados: $candidateList" -Command 'python --version' -Stdout $probeDetails
    }

    if ($MinimumVersion) {
        if ($MinimumVersion -notmatch '^\d+\.\d+(\.\d+)?$') {
            Stop-Preflight -Code 'BLOQUEO_RUNTIME' -Message "La versión mínima no tiene formato válido: $MinimumVersion." -Command 'preflight-python.ps1 -MinimumVersion <versión>'
        }

        $minimumText = if ($MinimumVersion.Split('.').Count -eq 2) { "$MinimumVersion.0" } else { $MinimumVersion }
        $minimum = [version]$minimumText
        if ([version]$versionResult.Version -lt $minimum) {
            Stop-Preflight -Code 'BLOQUEO_RUNTIME' -Message "Python $($versionResult.Version) no cumple la versión mínima $MinimumVersion." -Command $versionResult.Probe.Command -Stdout $versionResult.Probe.Stdout -Stderr $versionResult.Probe.Stderr -ExitCode $versionResult.Probe.ExitCode
        }
    }

    $workingPath = if ($WorkingDirectory) { $WorkingDirectory } else { $repoRoot }
    if (-not (Test-Path -LiteralPath $workingPath -PathType Container)) {
        Stop-Preflight -Code 'BLOQUEO_PYTHON_ENV' -Message "No existe el directorio de trabajo indicado: $workingPath." -Command 'preflight-python.ps1 -WorkingDirectory <ruta>'
    }
    $workingPath = (Resolve-Path -LiteralPath $workingPath).Path

    if ($RequiredModule.Count -gt 0) {
        foreach ($module in $RequiredModule) {
            if ($module -notmatch '^[A-Za-z_][A-Za-z0-9_.]*$') {
                Stop-Preflight -Code 'BLOQUEO_PYTHON_ENV' -Message "Nombre de módulo Python inválido: $module." -Command 'python -c <module-probe>'
            }
        }

        $moduleList = ($RequiredModule | ForEach-Object { "'$_'" }) -join ', '
        $moduleProbe = "import importlib.util,sys; required=[$moduleList]; missing=[name for name in required if importlib.util.find_spec(name) is None]; print('missing=' + ','.join(missing) if missing else 'modules=ready'); sys.exit(1 if missing else 0)"
        $moduleResult = Invoke-Python -Path $pythonPath -Arguments @('-c', $moduleProbe)
        if ($moduleResult.ExitCode -ne 0) {
            Stop-Preflight -Code 'BLOQUEO_PYTHON_ENV' -Message 'Faltan uno o más módulos Python requeridos.' -Command $moduleResult.Command -Stdout $moduleResult.Stdout -Stderr $moduleResult.Stderr -ExitCode $moduleResult.ExitCode
        }
    }

    Write-Output 'PYTHON_PREFLIGHT_OK'
    Write-Output "Python: $($versionResult.Text)"
    Write-Output "Executable: $pythonPath"
    Write-Output "WorkingDirectory: $workingPath"
    if ($RequiredModule.Count -gt 0) {
        Write-Output "Modules: $($RequiredModule -join ', ')"
    }
    else {
        Write-Output 'Modules: no requeridos'
    }
}
catch {
    Stop-Preflight -Code 'BLOQUEO_RUNTIME' -Message "Excepción no controlada: $($_.Exception.Message)"
}
