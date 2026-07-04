param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "gsdf-eotf-video-adjuster" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\gsdf-eotf-video-adjuster"
$PackageJson = Join-Path $TargetRoot "package.json"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$PowerShellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "gsdf-eotf-video-adjuster.stdout.log"
$StderrLog = Join-Path $LogDir "gsdf-eotf-video-adjuster.stderr.log"
$HealthUrl = "http://127.0.0.1:3101/"

function Test-GsdfHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Get-LogTail {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return "log unavailable"
  }
  return ((Get-Content -LiteralPath $Path -Tail 8) -join " | ")
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "GSDF/EOTF project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $PackageJson)) {
  throw "GSDF/EOTF package.json not found: $PackageJson"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedProcess = $false
if (-not (Test-GsdfHealth)) {
  $portCheck = & node $PortCheckScript `
    --registry $RegistryPath `
    --project "gsdf-eotf-video-adjuster" `
    --service "vite-dev" `
    --host "127.0.0.1" `
    --port "3101" `
    --protocol "http" `
    --json 2>&1

  $portCheckText = ($portCheck | Out-String).Trim()
  try {
    $portStatus = $portCheckText | ConvertFrom-Json
  } catch {
    throw ($portCheckText | Out-String).Trim()
  }

  if (-not $portStatus.ok) {
    throw "Governed port preflight failed for GSDF/EOTF video adjuster."
  }

  $childCommand = @(
    "Set-Location -LiteralPath '$TargetRoot'",
    "& '$NpmCommand' run dev 1>> '$StdoutLog' 2>> '$StderrLog'"
  ) -join "; "

  Start-Process -FilePath $PowerShellCommand `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $childCommand) `
    -WorkingDirectory $TargetRoot `
    -WindowStyle Hidden | Out-Null
  $startedProcess = $true

  $deadline = (Get-Date).AddSeconds(35)
  do {
    Start-Sleep -Seconds 2
    if (Test-GsdfHealth) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-GsdfHealth)) {
  $stdoutTail = Get-LogTail -Path $StdoutLog
  $stderrTail = Get-LogTail -Path $StderrLog
  [pscustomobject]@{
    ok = $false
    summary = "GSDF/EOTF dev server did not become healthy on $HealthUrl. stdout: $stdoutTail stderr: $stderrTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = if ($startedProcess) {
    "Started GSDF/EOTF Vite dev server at $HealthUrl."
  } else {
    "GSDF/EOTF Vite dev server was already healthy at $HealthUrl."
  }
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
