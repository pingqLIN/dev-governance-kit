param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "draw-draw" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\exc-draw"
$PortsConfigPath = Join-Path $TargetRoot "ops\local-ports.json"
$PackageJsonPath = Join-Path $TargetRoot "package.json"
$AppPackageJsonPath = Join-Path $TargetRoot "excalidraw-app\package.json"
$Port = 31700
$BindHost = "127.0.0.1"
$HealthUrl = "http://$BindHost`:$Port/"

function Test-DrawDrawHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    if ($response.StatusCode -ne 200) {
      return "unexpected"
    }
    if ($response.Content -like "*draw-draw UI Review Canvas*" -or $response.Content -like "*draw-draw*") {
      return "healthy"
    }
    return "unexpected"
  } catch {
    return "offline"
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "draw-draw project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $PortsConfigPath)) {
  throw "draw-draw local port config not found: $PortsConfigPath"
}

if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
  throw "draw-draw root package.json not found: $PackageJsonPath"
}

if (-not (Test-Path -LiteralPath $AppPackageJsonPath)) {
  throw "draw-draw app package.json not found: $AppPackageJsonPath"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

$portsConfig = Get-Content -LiteralPath $PortsConfigPath -Raw | ConvertFrom-Json
if ($portsConfig.project -ne "draw-draw" -or [int]$portsConfig.ports.frontend -ne $Port) {
  throw "draw-draw local port config does not match governed 127.0.0.1:$Port."
}

$rootPackage = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json
if ($rootPackage.name -ne "draw-draw-monorepo") {
  throw "draw-draw root package name is not draw-draw-monorepo."
}
if (-not ([string]$rootPackage.scripts.dev).Contains("require-governed-port.mjs")) {
  throw "draw-draw npm dev script does not use the governed port preflight."
}

$appPackage = Get-Content -LiteralPath $AppPackageJsonPath -Raw | ConvertFrom-Json
if ($appPackage.name -ne "draw-draw-app") {
  throw "draw-draw app workspace name is not draw-draw-app."
}

$portCheck = & node $PortCheckScript `
  --registry $RegistryPath `
  --project "draw-draw" `
  --service "web-http" `
  --host $BindHost `
  --port "$Port" `
  --protocol "http" `
  --allow-occupied `
  --json 2>&1

$portCheckText = ($portCheck | Out-String).Trim()
try {
  $portStatus = $portCheckText | ConvertFrom-Json
} catch {
  throw ($portCheckText | Out-String).Trim()
}

if (-not $portStatus.ok) {
  [pscustomobject]@{
    ok = $false
    summary = "Governed port check failed for draw-draw."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

$healthState = Test-DrawDrawHealth
if ($healthState -eq "unexpected") {
  [pscustomobject]@{
    ok = $false
    summary = "Port 31700 responded, but it did not look like draw-draw. Inspect the existing listener before restarting."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

$summary = if ($healthState -eq "healthy") {
  "draw-draw doctor passed and the UI is already online at $HealthUrl."
} else {
  "draw-draw doctor passed. The UI is offline, so use Restart to bring $HealthUrl online."
}

[pscustomobject]@{
  ok = $true
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
