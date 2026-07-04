param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "video-render-kit-web" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TargetRoot = "Q:\Projects\video-render-kit"
$Python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $Python) {
  throw "Python executable not found. Install Python or add python.exe to PATH."
}

$Port = if ($env:VIDEO_RENDER_KIT_PORT) { [int]$env:VIDEO_RENDER_KIT_PORT } else { 5001 }
$BindHost = if ($env:VIDEO_RENDER_KIT_HOST) { $env:VIDEO_RENDER_KIT_HOST } else { "127.0.0.1" }
$HealthUrl = "http://$BindHost`:$Port/api/state"
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "video-render-kit-web.stdout.log"
$StderrLog = Join-Path $LogDir "video-render-kit-web.stderr.log"
$Server = Join-Path $TargetRoot "web\server.py"

function Test-VideoRenderKitHealth {
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
  throw "Video Render Kit root not found: $TargetRoot"
}
if (-not (Test-Path -LiteralPath $Server)) {
  throw "Server script not found: $Server"
}

$started = $false
if (-not (Test-VideoRenderKitHealth)) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $oldPort = $env:VIDEO_RENDER_KIT_PORT
  $oldBindHost = $env:VIDEO_RENDER_KIT_HOST
  try {
    $env:VIDEO_RENDER_KIT_PORT = "$Port"
    $env:VIDEO_RENDER_KIT_HOST = $BindHost
    Start-Process -FilePath $Python `
      -ArgumentList @($Server) `
      -WorkingDirectory $TargetRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $StdoutLog `
      -RedirectStandardError $StderrLog | Out-Null
  } finally {
    if ($null -eq $oldPort) { Remove-Item Env:\VIDEO_RENDER_KIT_PORT -ErrorAction SilentlyContinue } else { $env:VIDEO_RENDER_KIT_PORT = $oldPort }
    if ($null -eq $oldBindHost) { Remove-Item Env:\VIDEO_RENDER_KIT_HOST -ErrorAction SilentlyContinue } else { $env:VIDEO_RENDER_KIT_HOST = $oldBindHost }
  }
  $started = $true

  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 2
    if (Test-VideoRenderKitHealth) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-VideoRenderKitHealth)) {
  $stdoutTail = Get-LogTail -Path $StdoutLog
  $stderrTail = Get-LogTail -Path $StderrLog
  [pscustomobject]@{
    ok = $false
    summary = "Video Render Kit control panel did not become healthy on $HealthUrl. stdout: $stdoutTail stderr: $stderrTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = if ($started) {
    "Started Video Render Kit control panel and confirmed /api/state."
  } else {
    "Video Render Kit control panel already healthy; confirmed /api/state."
  }
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
