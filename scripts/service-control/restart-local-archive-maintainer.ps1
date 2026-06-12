param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "local-archive-maintainer" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WinSWExe = "C:\svc-local-archive-maintainer\LocalArchiveMaintainerAppServer.exe"
$ServiceRoot = "C:\svc-local-archive-maintainer"
$TokenFile = Join-Path $ServiceRoot "secrets\app-server-token.txt"
$HealthUrl = "http://127.0.0.1:8787/health"
$WrapperLog = Join-Path $ServiceRoot ("logs\app-server-wrapper-{0}.log" -f (Get-Date -Format "yyyyMMdd"))

try {
  if (-not (Test-Path -LiteralPath $WinSWExe)) {
    throw "WinSW executable not found: $WinSWExe"
  }
  if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "Token file missing: $TokenFile"
  }

  $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Token file is empty: $TokenFile"
  }

  $restartOutput = & $WinSWExe restart 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw (($restartOutput | Out-String).Trim())
  }

  $deadline = (Get-Date).AddSeconds(15)
  do {
    try {
      $response = Invoke-RestMethod -UseBasicParsing -Uri $HealthUrl -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 5
      if ($response.status -eq "ok" -and $response.service -eq "LocalArchiveMaintainer") {
        [pscustomobject]@{
          ok = $true
          summary = "Restarted Local Archive Maintainer and restored http://127.0.0.1:8787/health"
          controlTargetId = $ControlTargetId
          action = $Action
          output = ($restartOutput | Out-String).Trim()
        } | ConvertTo-Json -Compress
        exit 0
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)

  $logTail = if (Test-Path -LiteralPath $WrapperLog) {
    ((Get-Content -LiteralPath $WrapperLog -Tail 3) -join " | ")
  } else {
    "wrapper log unavailable"
  }
  throw "Service restart command completed but health did not recover on $HealthUrl. Recent wrapper log: $logTail"
} catch {
  [pscustomobject]@{
    ok = $false
    summary = $_.Exception.Message
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}
