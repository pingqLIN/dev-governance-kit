param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "local-archive-maintainer" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$ServiceName = "LocalArchiveMaintainerAppServer"
$ServiceRoot = "C:\svc-local-archive-maintainer"
$TokenFile = Join-Path $ServiceRoot "secrets\app-server-token.txt"
$HealthUrl = "http://127.0.0.1:8787/health"
$WrapperLog = Join-Path $ServiceRoot ("logs\app-server-wrapper-{0}.log" -f (Get-Date -Format "yyyyMMdd"))

try {
  $service = Get-Service -Name $ServiceName -ErrorAction Stop
  $serviceState = [string]$service.Status

  if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "Token file missing: $TokenFile"
  }

  $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Token file is empty: $TokenFile"
  }

  $response = Invoke-RestMethod -UseBasicParsing -Uri $HealthUrl -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 5
  if ($response.status -eq "ok" -and $response.service -eq "LocalArchiveMaintainer") {
    [pscustomobject]@{
      ok = $true
      summary = "Local Archive Maintainer service is healthy on http://127.0.0.1:8787/health"
      controlTargetId = $ControlTargetId
      action = $Action
      serviceState = $serviceState
    } | ConvertTo-Json -Compress
    exit 0
  }

  throw "Health endpoint responded unexpectedly."
} catch {
  $logTail = if (Test-Path -LiteralPath $WrapperLog) {
    ((Get-Content -LiteralPath $WrapperLog -Tail 3) -join " | ")
  } else {
    "wrapper log unavailable"
  }
  [pscustomobject]@{
    ok = $false
    summary = "Service state=$serviceState but health check failed for $HealthUrl. Recent wrapper log: $logTail"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}
