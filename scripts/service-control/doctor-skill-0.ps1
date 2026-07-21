param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "skill-0" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\skill-0"
$Python = Join-Path $TargetRoot ".venv\Scripts\python.exe"
$ApiEntry = Join-Path $TargetRoot "api\main.py"
$DatabasePath = Join-Path $WorkspaceRoot "reports\runtime\skill-0\skills.db"
$HealthUrl = "http://127.0.0.1:8000/health"

function Get-Skill0Health {
  try {
    return Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
  } catch {
    return $null
  }
}

foreach ($requiredPath in @($TargetRoot, $Python, $ApiEntry, $DatabasePath, $PortCheckScript)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required Skill-0 Doctor path not found: $requiredPath"
  }
}

$databaseFile = Get-Item -LiteralPath $DatabasePath
if ($databaseFile.Length -le 0) {
  throw "Skill-0 runtime database is empty: $DatabasePath"
}

$portCheck = & node $PortCheckScript `
  --registry $RegistryPath `
  --project "skill-0" `
  --service "core-api-http" `
  --host "127.0.0.1" `
  --port "8000" `
  --protocol "http" `
  --allow-occupied `
  --json 2>&1

$portCheckText = ($portCheck | Out-String).Trim()
try {
  $portStatus = $portCheckText | ConvertFrom-Json
} catch {
  throw $portCheckText
}

if (-not $portStatus.ok) {
  throw "Governed port check failed for Skill-0 Core API."
}

Push-Location $TargetRoot
try {
  & $Python -B -c "import api.main" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Skill-0 Core API import check failed."
  }
} finally {
  Pop-Location
}

$health = Get-Skill0Health
if ($null -ne $health -and $health.status -ne "healthy") {
  throw "Skill-0 Core API returned an unexpected health payload."
}

$summary = if ($null -ne $health) {
  "Skill-0 Core API doctor passed and the service is healthy at $HealthUrl using the governed runtime database."
} else {
  "Skill-0 Core API doctor passed, including the governed runtime database. The service is offline, so use Restart to start the loopback server."
}

[pscustomobject]@{
  ok = $true
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
  healthUrl = $HealthUrl
} | ConvertTo-Json -Compress
