param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "url-hero" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\url-hero"
$PackageJson = Join-Path $TargetRoot "package.json"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$HealthUrl = "http://127.0.0.1:3100/url-hero/"

function Test-UrlHeroHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "url-hero project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $PackageJson)) {
  throw "url-hero package.json not found: $PackageJson"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

$portCheck = & node $PortCheckScript `
  --registry $RegistryPath `
  --project "url-hero" `
  --service "vite-dev" `
  --host "127.0.0.1" `
  --port "3100" `
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
    summary = "Governed port check failed for URL Hero."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

Push-Location $TargetRoot
try {
  $lintOutput = & $NpmCommand run lint 2>&1
  if ($LASTEXITCODE -ne 0) {
    [pscustomobject]@{
      ok = $false
      summary = "URL Hero lint failed."
      controlTargetId = $ControlTargetId
      action = $Action
    } | ConvertTo-Json -Compress
    exit 1
  }

  $testOutput = & $NpmCommand run test 2>&1
  if ($LASTEXITCODE -ne 0) {
    [pscustomobject]@{
      ok = $false
      summary = "URL Hero test suite failed."
      controlTargetId = $ControlTargetId
      action = $Action
    } | ConvertTo-Json -Compress
    exit 1
  }
} finally {
  Pop-Location
}

$healthOnline = Test-UrlHeroHealth
$summary = if ($healthOnline) {
  "URL Hero doctor passed and the Vite dev server is already online."
} else {
  "URL Hero doctor passed. The Vite dev server is currently offline, so use Restart to bring http://127.0.0.1:3100/url-hero/ online."
}

[pscustomobject]@{
  ok = $true
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
