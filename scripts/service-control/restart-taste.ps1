param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "taste" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TargetRoot = "Q:\Projects\taste"
$CheckScript = Join-Path $TargetRoot "scripts\check-runtime.mjs"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "taste-dev.stdout.log"
$StderrLog = Join-Path $LogDir "taste-dev.stderr.log"
$LocalUrl = "http://127.0.0.1:3010"
$ExpectedTitle = "<title>Taste Archive</title>"

function Test-TasteLocalHome {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $LocalUrl -TimeoutSec 5
    $body = [string]$response.Content
    return ($response.StatusCode -eq 200 -and $body.Contains($ExpectedTitle))
  } catch {
    return $false
  }
}

function Invoke-TasteDoctor {
  $output = & node $CheckScript 2>&1
  $jsonText = ($output | Out-String).Trim()
  try {
    return ($jsonText | ConvertFrom-Json)
  } catch {
    throw ($jsonText | Out-String).Trim()
  }
}

function Get-LogTail {
  param(
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return "log unavailable"
  }

  return ((Get-Content -LiteralPath $Path -Tail 6) -join " | ")
}

if (-not (Test-Path -LiteralPath $CheckScript)) {
  throw "Taste runtime check script not found: $CheckScript"
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "Taste project root not found: $TargetRoot"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedProcess = $false
if (-not (Test-TasteLocalHome)) {
  Start-Process -FilePath $NpmCommand `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory $TargetRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog | Out-Null
  $startedProcess = $true

  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Seconds 2
    if (Test-TasteLocalHome) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-TasteLocalHome)) {
  $stdoutTail = Get-LogTail -Path $StdoutLog
  $stderrTail = Get-LogTail -Path $StderrLog
  [pscustomobject]@{
    ok = $false
    summary = "Taste local runtime did not become healthy on $LocalUrl. stdout: $stdoutTail stderr: $stderrTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

$doctor = Invoke-TasteDoctor
$failedChecks = @($doctor.results | Where-Object { -not $_.ok } | Select-Object -ExpandProperty key)
$summary = if ($doctor.ok) {
  if ($startedProcess) {
    "Started Taste runtime and confirmed local/public endpoints."
  } else {
    "Taste runtime already healthy; confirmed local/public endpoints."
  }
} else {
  "Taste local runtime is healthy, but full runtime check still fails: " + ($failedChecks -join ", ")
}

[pscustomobject]@{
  ok = [bool]$doctor.ok
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $doctor.ok) {
  exit 1
}
