param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "gsdf-eotf-video-adjuster" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\gsdf-eotf-video-adjuster"
$PackageJson = Join-Path $TargetRoot "package.json"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$HealthUrl = "http://127.0.0.1:3101/"

function Test-GsdfHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "GSDF/EOTF project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $PackageJson)) {
  throw "GSDF/EOTF package.json not found: $PackageJson"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

$portCheck = & node $PortCheckScript `
  --registry $RegistryPath `
  --project "gsdf-eotf-video-adjuster" `
  --service "vite-dev" `
  --host "127.0.0.1" `
  --port "3101" `
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
  throw "Governed port check failed for GSDF/EOTF video adjuster."
}

Push-Location $TargetRoot
try {
  & $NpmCommand run lint | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "GSDF/EOTF lint failed."
  }

  & $NpmCommand test | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "GSDF/EOTF test suite failed."
  }
} finally {
  Pop-Location
}

$summary = if (Test-GsdfHealth) {
  "GSDF/EOTF doctor passed and the Vite dev server is already online at $HealthUrl."
} else {
  "GSDF/EOTF doctor passed. The Vite dev server is offline, so use Restart to bring $HealthUrl online."
}

[pscustomobject]@{
  ok = $true
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
