param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "codex-remote" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "C:\Users\miles\Documents\Codex\2026-05-10\codex"
$StartScript = Join-Path $TargetRoot "Start-CodexRemoteOnLogin.ps1"
$LocalHealthUrl = "http://127.0.0.1:14555/healthz"
$LocalReadyUrl = "http://127.0.0.1:14555/readyz"
$PublicHealthUrl = "https://codex-remote.colorgeek.co/healthz"
$PublicReadyUrl = "https://codex-remote.colorgeek.co/readyz"

function Test-RemoteEndpoint {
  param(
    [string]$Url,
    [int]$TimeoutSec = 8
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "codex-remote runtime root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "codex-remote start script not found: $StartScript"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $StartScript 2>&1 | Out-Null

$deadline = (Get-Date).AddSeconds(25)
do {
  Start-Sleep -Seconds 2
  $localHealthOk = Test-RemoteEndpoint -Url $LocalHealthUrl -TimeoutSec 5
  $localReadyOk = Test-RemoteEndpoint -Url $LocalReadyUrl -TimeoutSec 5
  $publicHealthOk = Test-RemoteEndpoint -Url $PublicHealthUrl -TimeoutSec 10
  $publicReadyOk = Test-RemoteEndpoint -Url $PublicReadyUrl -TimeoutSec 10
  if ($localHealthOk -and $localReadyOk -and $publicHealthOk -and $publicReadyOk) {
    break
  }
} while ((Get-Date) -lt $deadline)

$ok = ($localHealthOk -and $localReadyOk -and $publicHealthOk -and $publicReadyOk)
$summary = if ($ok) {
  "Started codex-remote and confirmed local/public healthz and readyz."
} elseif ($localHealthOk -and $localReadyOk) {
  "codex-remote local healthz and readyz recovered, but public route checks still fail."
} else {
  "codex-remote did not recover local healthz and readyz after the reviewed restart attempt."
}

[pscustomobject]@{
  ok = $ok
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $ok) {
  exit 1
}
