param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "draw-draw" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\exc-draw"
$PackageJsonPath = Join-Path $TargetRoot "package.json"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$PowerShellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "draw-draw.stdout.log"
$StderrLog = Join-Path $LogDir "draw-draw.stderr.log"
$Port = 31700
$BindHost = "127.0.0.1"
$HealthUrl = "http://$BindHost`:$Port/"

function Test-DrawDrawHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    return (
      $response.StatusCode -eq 200 -and (
        $response.Content -like "*draw-draw UI Review Canvas*" -or
        $response.Content -like "*draw-draw*"
      )
    )
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
  throw "draw-draw project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
  throw "draw-draw root package.json not found: $PackageJsonPath"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedProcess = $false
if (-not (Test-DrawDrawHealth)) {
  $portCheck = & node $PortCheckScript `
    --registry $RegistryPath `
    --project "draw-draw" `
    --service "web-http" `
    --host $BindHost `
    --port "$Port" `
    --protocol "http" `
    --json 2>&1

  $portCheckText = ($portCheck | Out-String).Trim()
  try {
    $portStatus = $portCheckText | ConvertFrom-Json
  } catch {
    throw ($portCheckText | Out-String).Trim()
  }

  if (-not $portStatus.ok) {
    throw "Governed port preflight failed for draw-draw."
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

  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Seconds 2
    if (Test-DrawDrawHealth) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-DrawDrawHealth)) {
  $stdoutTail = Get-LogTail -Path $StdoutLog
  $stderrTail = Get-LogTail -Path $StderrLog
  [pscustomobject]@{
    ok = $false
    summary = "draw-draw did not become healthy on $HealthUrl. stdout: $stdoutTail stderr: $stderrTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = if ($startedProcess) {
    "Started draw-draw and confirmed the UI at $HealthUrl."
  } else {
    "draw-draw was already healthy at $HealthUrl."
  }
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
