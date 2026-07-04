param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "skill-0-gui" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\skill-0-GUI"
$PackageJson = Join-Path $TargetRoot "package.json"
$ServerEntry = Join-Path $TargetRoot "server.mjs"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$HealthUrl = "http://127.0.0.1:3102/healthz"

function Test-Skill0Health {
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
    return ($health.ok -eq $true)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "Skill-0 GUI project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $PackageJson)) {
  throw "Skill-0 GUI package.json not found: $PackageJson"
}

if (-not (Test-Path -LiteralPath $ServerEntry)) {
  throw "Skill-0 GUI server entry not found: $ServerEntry"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

$portCheck = & node $PortCheckScript `
  --registry $RegistryPath `
  --project "skill-0-GUI" `
  --service "review-studio-http" `
  --host "127.0.0.1" `
  --port "3102" `
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
  throw "Governed port check failed for Skill-0 Review Studio."
}

Push-Location $TargetRoot
try {
  & $NpmCommand run lint | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Skill-0 Review Studio lint failed."
  }

  & $NpmCommand test | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Skill-0 Review Studio tests failed."
  }

  & $NpmCommand run docs:check | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Skill-0 Review Studio docs check failed."
  }
} finally {
  Pop-Location
}

$summary = if (Test-Skill0Health) {
  "Skill-0 Review Studio doctor passed and /healthz is online at $HealthUrl."
} else {
  "Skill-0 Review Studio doctor passed. The review studio is offline, so use Restart to build and start the loopback server."
}

[pscustomobject]@{
  ok = $true
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
