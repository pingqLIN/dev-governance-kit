param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "skill-0-dashboard" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$CoreRestart = Join-Path $WorkspaceRoot "scripts\service-control\restart-skill-0.ps1"
$TargetRoot = "Q:\Projects\skill-0"
$DashboardRoot = Join-Path $TargetRoot "skill-0-dashboard"
$WebRoot = Join-Path $DashboardRoot "apps\web"
$Python = Join-Path $TargetRoot ".venv\Scripts\python.exe"
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$PowerShellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$ApiStdout = Join-Path $LogDir "skill-0-dashboard-api.stdout.log"
$ApiStderr = Join-Path $LogDir "skill-0-dashboard-api.stderr.log"
$WebStdout = Join-Path $LogDir "skill-0-dashboard-web.stdout.log"
$WebStderr = Join-Path $LogDir "skill-0-dashboard-web.stderr.log"
$ApiHealthUrl = "http://127.0.0.1:8001/health"
$WebUrl = "http://127.0.0.1:5173/"

function Test-Url {
  param([string]$Url, [string]$ExpectedStatus)
  try {
    if ($ExpectedStatus) {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec 5
      return ($response.status -eq $ExpectedStatus)
    }
    return ((Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200)
  } catch { return $false }
}

function Confirm-AvailablePort {
  param([string]$Service, [int]$Port)
  $output = & node $PortCheckScript --registry $RegistryPath --project "skill-0" --service $Service --host "127.0.0.1" --port "$Port" --protocol "http" --json 2>&1
  $text = ($output | Out-String).Trim()
  try { $result = $text | ConvertFrom-Json } catch { throw $text }
  if (-not $result.ok) { throw "Governed port preflight failed for $Service." }
}

function Wait-ForUrl {
  param([string]$Url, [string]$ExpectedStatus, [int]$Seconds)
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    Start-Sleep -Seconds 2
    if (Test-Url -Url $Url -ExpectedStatus $ExpectedStatus) { return $true }
  } while ((Get-Date) -lt $deadline)
  return $false
}

foreach ($requiredPath in @($TargetRoot, $DashboardRoot, $WebRoot, $Python, $PortCheckScript, $CoreRestart)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required Skill-0 Dashboard startup path not found: $requiredPath" }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

& $CoreRestart -ControlTargetId "skill-0" -Action "restart" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Skill-0 Core API startup failed before Dashboard startup." }

$apiStarted = $false
if (-not (Test-Url -Url $ApiHealthUrl -ExpectedStatus "healthy")) {
  Confirm-AvailablePort -Service "dashboard-api-http" -Port 8001
  $apiCommand = "Set-Location -LiteralPath '$DashboardRoot'; & '$Python' -B -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8001 1>> '$ApiStdout' 2>> '$ApiStderr'"
  Start-Process -FilePath $PowerShellCommand -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $apiCommand) -WorkingDirectory $DashboardRoot -WindowStyle Hidden | Out-Null
  $apiStarted = $true
  if (-not (Wait-ForUrl -Url $ApiHealthUrl -ExpectedStatus "healthy" -Seconds 45)) { throw "Skill-0 Dashboard API did not become healthy. Inspect $ApiStderr" }
}

$webStarted = $false
if (-not (Test-Url -Url $WebUrl -ExpectedStatus "")) {
  Confirm-AvailablePort -Service "dashboard-web-http" -Port 5173
  $webCommand = "Set-Location -LiteralPath '$WebRoot'; & '$Npm' run dev -- --host 127.0.0.1 --port 5173 --strictPort 1>> '$WebStdout' 2>> '$WebStderr'"
  Start-Process -FilePath $PowerShellCommand -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $webCommand) -WorkingDirectory $WebRoot -WindowStyle Hidden | Out-Null
  $webStarted = $true
  if (-not (Wait-ForUrl -Url $WebUrl -ExpectedStatus "" -Seconds 45)) { throw "Skill-0 Dashboard Web did not become ready. Inspect $WebStderr" }
}

[pscustomobject]@{
  ok = $true
  summary = "Skill-0 Dashboard is ready. API started: $apiStarted; Web started: $webStarted."
  controlTargetId = $ControlTargetId
  action = $Action
  apiHealthUrl = $ApiHealthUrl
  webUrl = $WebUrl
} | ConvertTo-Json -Compress
