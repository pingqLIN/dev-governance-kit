param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "skill-0" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\skill-0"
$Python = Join-Path $TargetRoot ".venv\Scripts\python.exe"
$ApiEntry = Join-Path $TargetRoot "api\main.py"
$DatabasePath = Join-Path $WorkspaceRoot "reports\runtime\skill-0\skills.db"
$EmbeddingModelPath = Join-Path $TargetRoot ".hf-cache\all-MiniLM-L6-v2"
$PowerShellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "skill-0.stdout.log"
$StderrLog = Join-Path $LogDir "skill-0.stderr.log"
$HealthUrl = "http://127.0.0.1:8000/health"

function Test-Skill0Health {
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
    return ($health.status -eq "healthy")
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

foreach ($requiredPath in @($TargetRoot, $Python, $ApiEntry, $DatabasePath, $PortCheckScript)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required Skill-0 startup path not found: $requiredPath"
  }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedProcess = $false
if (-not (Test-Skill0Health)) {
  $portCheck = & node $PortCheckScript `
    --registry $RegistryPath `
    --project "skill-0" `
    --service "core-api-http" `
    --host "127.0.0.1" `
    --port "8000" `
    --protocol "http" `
    --json 2>&1

  $portCheckText = ($portCheck | Out-String).Trim()
  try {
    $portStatus = $portCheckText | ConvertFrom-Json
  } catch {
    throw $portCheckText
  }

  if (-not $portStatus.ok) {
    throw "Governed port preflight failed for Skill-0 Core API."
  }

  $childCommandParts = @(
    "Set-Location -LiteralPath '$TargetRoot'",
    "`$env:SKILL0_DB_PATH = '$DatabasePath'"
  )
  if (Test-Path -LiteralPath $EmbeddingModelPath) {
    $childCommandParts += "`$env:SKILL0_EMBEDDING_MODEL = '$EmbeddingModelPath'"
  }
  $childCommandParts += @(
    "`$env:SKILL0_DEVICE = 'cpu'",
    "& '$Python' -B -m uvicorn api.main:app --host 127.0.0.1 --port 8000 1>> '$StdoutLog' 2>> '$StderrLog'"
  )
  $childCommand = $childCommandParts -join "; "

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
    summary = "Skill-0 Core API did not become healthy on $HealthUrl. stdout: $stdoutTail stderr: $stderrTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = if ($startedProcess) {
    "Started Skill-0 Core API at $HealthUrl."
  } else {
    "Skill-0 Core API was already healthy at $HealthUrl."
  }
  controlTargetId = $ControlTargetId
  action = $Action
  healthUrl = $HealthUrl
} | ConvertTo-Json -Compress
