param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "skill-0-dashboard" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\skill-0"
$DashboardRoot = Join-Path $TargetRoot "skill-0-dashboard"
$WebRoot = Join-Path $DashboardRoot "apps\web"
$Python = Join-Path $TargetRoot ".venv\Scripts\python.exe"
$ApiEntry = Join-Path $DashboardRoot "apps\api\main.py"
$PackageJson = Join-Path $WebRoot "package.json"
$ViteBinary = Join-Path $WebRoot "node_modules\.bin\vite.cmd"
$ApiHealthUrl = "http://127.0.0.1:8001/health"
$WebUrl = "http://127.0.0.1:5173/"

function Confirm-GovernedPort {
  param([string]$Service, [int]$Port)
  $output = & node $PortCheckScript --registry $RegistryPath --project "skill-0" --service $Service --host "127.0.0.1" --port "$Port" --protocol "http" --allow-occupied --json 2>&1
  $text = ($output | Out-String).Trim()
  try { $result = $text | ConvertFrom-Json } catch { throw $text }
  if (-not $result.ok) { throw "Governed port check failed for $Service." }
}

foreach ($requiredPath in @($TargetRoot, $DashboardRoot, $WebRoot, $Python, $ApiEntry, $PackageJson, $ViteBinary, $PortCheckScript)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required Skill-0 Dashboard Doctor path not found: $requiredPath"
  }
}

Confirm-GovernedPort -Service "dashboard-api-http" -Port 8001
Confirm-GovernedPort -Service "dashboard-web-http" -Port 5173

Push-Location $DashboardRoot
try {
  & $Python -B -c "import apps.api.main" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Skill-0 Dashboard API import check failed." }
} finally {
  Pop-Location
}

$apiOnline = $false
try {
  $apiHealth = Invoke-RestMethod -Uri $ApiHealthUrl -TimeoutSec 5
} catch { $apiHealth = $null }
if ($null -ne $apiHealth) {
  if ($apiHealth.status -ne "healthy") { throw "Dashboard API returned an unexpected health payload." }
  $apiOnline = $true
}

$webOnline = $false
try {
  $webResponse = Invoke-WebRequest -Uri $WebUrl -UseBasicParsing -TimeoutSec 5
  $webOnline = ($webResponse.StatusCode -eq 200)
} catch { $webOnline = $false }

[pscustomobject]@{
  ok = $true
  summary = "Skill-0 Dashboard doctor passed. API online: $apiOnline; Web online: $webOnline. Use Restart when either service is offline."
  controlTargetId = $ControlTargetId
  action = $Action
  apiHealthUrl = $ApiHealthUrl
  webUrl = $WebUrl
} | ConvertTo-Json -Compress
