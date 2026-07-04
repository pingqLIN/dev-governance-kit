param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "skill-0-gui" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\skill-0-GUI"
$PackageJson = Join-Path $TargetRoot "package.json"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$PowerShellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "skill-0-gui.stdout.log"
$StderrLog = Join-Path $LogDir "skill-0-gui.stderr.log"
$HealthUrl = "http://127.0.0.1:3102/healthz"

function Test-Skill0Health {
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
    return ($health.ok -eq $true)
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
  throw "Skill-0 GUI project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $PackageJson)) {
  throw "Skill-0 GUI package.json not found: $PackageJson"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedProcess = $false
if (-not (Test-Skill0Health)) {
  $portCheck = & node $PortCheckScript `
    --registry $RegistryPath `
    --project "skill-0-GUI" `
    --service "review-studio-http" `
    --host "127.0.0.1" `
    --port "3102" `
    --protocol "http" `
    --json 2>&1

  $portCheckText = ($portCheck | Out-String).Trim()
  try {
    $portStatus = $portCheckText | ConvertFrom-Json
  } catch {
    throw ($portCheckText | Out-String).Trim()
  }

  if (-not $portStatus.ok) {
    throw "Governed port preflight failed for Skill-0 Review Studio."
  }

  Push-Location $TargetRoot
  try {
    & $NpmCommand run build | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Skill-0 Review Studio build failed."
    }
  } finally {
    Pop-Location
  }

  $childCommand = @(
    "Set-Location -LiteralPath '$TargetRoot'",
    '$env:PORT = ''3102''',
    '$env:SKILL0_HOST = ''127.0.0.1''',
    '$env:SKILL0_MODE = ''standalone''',
    "& '$NpmCommand' start 1>> '$StdoutLog' 2>> '$StderrLog'"
  ) -join "; "

  Start-Process -FilePath $PowerShellCommand `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $childCommand) `
    -WorkingDirectory $TargetRoot `
    -WindowStyle Hidden | Out-Null
  $startedProcess = $true

  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 2
    if (Test-Skill0Health) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-Skill0Health)) {
  $stdoutTail = Get-LogTail -Path $StdoutLog
  $stderrTail = Get-LogTail -Path $StderrLog
  [pscustomobject]@{
    ok = $false
    summary = "Skill-0 Review Studio did not become healthy on $HealthUrl. stdout: $stdoutTail stderr: $stderrTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = if ($startedProcess) {
    "Built and started Skill-0 Review Studio at $HealthUrl."
  } else {
    "Skill-0 Review Studio was already healthy at $HealthUrl."
  }
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
