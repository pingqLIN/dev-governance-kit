param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "codex-remote" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "C:\Users\miles\Documents\Codex\2026-05-10\codex"
$StatusScript = Join-Path $TargetRoot "Status-CodexRemoteService.ps1"
$TunnelStatusScript = Join-Path $TargetRoot "CodexRemote-Tunnel-Status.ps1"
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

if (-not (Test-Path -LiteralPath $StatusScript)) {
  throw "codex-remote status script not found: $StatusScript"
}

if (-not (Test-Path -LiteralPath $TunnelStatusScript)) {
  throw "codex-remote tunnel status script not found: $TunnelStatusScript"
}

$statusOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $StatusScript 2>&1
$tunnelOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $TunnelStatusScript 2>&1

$localHealthOk = Test-RemoteEndpoint -Url $LocalHealthUrl -TimeoutSec 5
$localReadyOk = Test-RemoteEndpoint -Url $LocalReadyUrl -TimeoutSec 5
$publicHealthOk = Test-RemoteEndpoint -Url $PublicHealthUrl -TimeoutSec 10
$publicReadyOk = Test-RemoteEndpoint -Url $PublicReadyUrl -TimeoutSec 10

$summary = if ($localHealthOk -and $localReadyOk -and $publicHealthOk -and $publicReadyOk) {
  "codex-remote healthz and readyz passed for local and public endpoints."
} elseif ($localHealthOk -and $localReadyOk) {
  "codex-remote local healthz and readyz passed, but public route checks still fail."
} else {
  "codex-remote local healthz/readyz checks failed."
}

[pscustomobject]@{
  ok = ($localHealthOk -and $localReadyOk -and $publicHealthOk -and $publicReadyOk)
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not ($localHealthOk -and $localReadyOk -and $publicHealthOk -and $publicReadyOk)) {
  exit 1
}
