param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "url-hero" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\url-hero"
$PackageJson = Join-Path $TargetRoot "package.json"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$PowerShellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "url-hero-dev.stdout.log"
$StderrLog = Join-Path $LogDir "url-hero-dev.stderr.log"
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

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedProcess = $false
if (-not (Test-UrlHeroHealth)) {
  $portCheck = & node $PortCheckScript `
    --registry $RegistryPath `
    --project "url-hero" `
    --service "vite-dev" `
    --host "127.0.0.1" `
    --port "3100" `
    --protocol "http" `
    --json 2>&1

  $portCheckText = ($portCheck | Out-String).Trim()
  try {
    $portStatus = $portCheckText | ConvertFrom-Json
  } catch {
    throw ($portCheckText | Out-String).Trim()
  }

  if (-not $portStatus.ok) {
    throw "Governed port preflight failed for URL Hero."
  }

  $childCommand = @(
    "Set-Location -LiteralPath '$TargetRoot'",
    '$env:DISABLE_HMR = ''true''',
    "& '$NpmCommand' run dev 1>> '$StdoutLog' 2>> '$StderrLog'"
  ) -join "; "

  Start-Process -FilePath $PowerShellCommand `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $childCommand) `
    -WorkingDirectory $TargetRoot `
    -WindowStyle Hidden | Out-Null
  $startedProcess = $true

  $deadline = (Get-Date).AddSeconds(25)
  do {
    Start-Sleep -Seconds 2
    if (Test-UrlHeroHealth) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-UrlHeroHealth)) {
  [pscustomobject]@{
    ok = $false
    summary = "URL Hero did not become healthy on $HealthUrl after the reviewed ensure-running attempt."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = $(if ($startedProcess) { "Started URL Hero and confirmed the Vite dev server on http://127.0.0.1:3100/url-hero/." } else { "URL Hero was already healthy." })
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
