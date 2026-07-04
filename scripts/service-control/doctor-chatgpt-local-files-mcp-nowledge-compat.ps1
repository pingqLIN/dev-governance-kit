param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "chatgpt-local-files-mcp-nowledge-compat" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "Q:\Projects\chatgpt-local-files-mcp"
$StartScript = Join-Path $TargetRoot "scripts\start-nowledge-compat.ps1"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
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

Push-Location $TargetRoot
try {
  & $NpmCommand exec -- vitest run test/nowledge-compat.test.ts | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Nowledge compat tests failed."
  }
} finally {
  Pop-Location
}

$summary = if (Test-NowledgeHealth) {
  "Nowledge compat doctor passed and the local API is online at $HealthUrl."
} else {
  "Nowledge compat doctor passed. The local API is offline, so use Restart to bring $HealthUrl online."
}

[pscustomobject]@{
  ok = $true
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
