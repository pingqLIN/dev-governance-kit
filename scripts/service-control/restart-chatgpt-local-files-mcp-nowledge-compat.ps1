param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "chatgpt-local-files-mcp-nowledge-compat" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "Q:\Projects\chatgpt-local-files-mcp"
$StartScript = Join-Path $TargetRoot "scripts\start-nowledge-compat.ps1"
$HealthUrl = "http://127.0.0.1:14242/health"

function Test-NowledgeHealth {
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
    return ($health.service -eq "nowledge-local-compat")
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "chatgpt-local-files-mcp project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Nowledge compat start script not found: $StartScript"
}

$startedProcess = $false
if (-not (Test-NowledgeHealth)) {
  Push-Location $TargetRoot
  try {
    & $StartScript -Build | Out-Null
  } finally {
    Pop-Location
  }
  $startedProcess = $true
}

if (-not (Test-NowledgeHealth)) {
  [pscustomobject]@{
    ok = $false
    summary = "Nowledge compat API did not become healthy on $HealthUrl after the reviewed start script."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = if ($startedProcess) {
    "Started Nowledge compat API and confirmed $HealthUrl."
  } else {
    "Nowledge compat API was already healthy at $HealthUrl."
  }
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
