param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "color-management-shader" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\color-management-Shader"
$DemoRoot = Join-Path $TargetRoot "demo\display-shader-control-lab"
$IndexPath = Join-Path $DemoRoot "index.html"
$HealthUrl = "http://127.0.0.1:4173/index.html"

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "color-management-Shader project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $IndexPath)) {
  throw "Display shader control lab index not found: $IndexPath"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

$portCheck = & node $PortCheckScript `
  --registry $RegistryPath `
  --project "color-management-Shader" `
  --service "display-shader-control-lab-http" `
  --host "127.0.0.1" `
  --port "4173" `
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
    summary = "Governed port check failed for Display Shader Control Lab."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

$healthOk = $false
$contentOk = $false
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
  $contentOk = $response.Content -like "*Display Shader Control Lab*"
  $healthOk = ($response.StatusCode -eq 200 -and $contentOk)
} catch {
  $healthOk = $false
}

$summary = if ($healthOk) {
  "Display Shader Control Lab static preview is healthy."
} else {
  "Display Shader Control Lab is not responding on $HealthUrl."
}

[pscustomobject]@{
  ok = $healthOk
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $healthOk) {
  exit 1
}
