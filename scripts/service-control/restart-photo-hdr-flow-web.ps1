param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "photo-hdr-flow-web" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TargetRoot = "Q:\Projects\photo-hdr-flow"
$Python = Join-Path $TargetRoot ".venv\Scripts\python.exe"
$HealthUrl = "http://127.0.0.1:8765/api/health"
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "photo-hdr-flow-web.stdout.log"
$StderrLog = Join-Path $LogDir "photo-hdr-flow-web.stderr.log"

function Test-PhotoHdrFlowHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    if ($response.StatusCode -ne 200) {
      return $false
    }
    $body = [string]$response.Content
    return ($body -match '"ok"\s*:\s*true')
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

if (-not (Test-Path -LiteralPath $Python)) {
  throw "Photo HDR Flow venv python not found: $Python"
}

$started = $false
if (-not (Test-PhotoHdrFlowHealth)) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Start-Process -FilePath $Python `
    -ArgumentList @("-m", "photo_hdr_flow", "web", "--host", "127.0.0.1", "--port", "8765") `
    -WorkingDirectory $TargetRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog | Out-Null
  $started = $true

  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 2
    if (Test-PhotoHdrFlowHealth) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-PhotoHdrFlowHealth)) {
  $stdoutTail = Get-LogTail -Path $StdoutLog
  $stderrTail = Get-LogTail -Path $StderrLog
  [pscustomobject]@{
    ok = $false
    summary = "Photo HDR Flow web UI did not become healthy on $HealthUrl. stdout: $stdoutTail stderr: $stderrTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = if ($started) { "Started Photo HDR Flow web UI and confirmed /api/health." } else { "Photo HDR Flow web UI already healthy; confirmed /api/health." }
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
