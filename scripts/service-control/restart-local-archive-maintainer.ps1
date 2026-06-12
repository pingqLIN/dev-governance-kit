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
$ServiceName = "LocalArchiveMaintainerAppServer"
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

  $stdoutFile = Join-Path $env:TEMP ("local-archive-maintainer-restart-{0}-stdout.log" -f [guid]::NewGuid().ToString("N"))
  $stderrFile = Join-Path $env:TEMP ("local-archive-maintainer-restart-{0}-stderr.log" -f [guid]::NewGuid().ToString("N"))
  $restartProcess = Start-Process -FilePath $WinSWExe `
    -ArgumentList @("restart") `
    -WorkingDirectory $ServiceRoot `
    -WindowStyle Hidden `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile

  $restartOutput = @()
  if (Test-Path -LiteralPath $stdoutFile) {
    $restartOutput += Get-Content -LiteralPath $stdoutFile
    Remove-Item -LiteralPath $stdoutFile -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $stderrFile) {
    $restartOutput += Get-Content -LiteralPath $stderrFile
    Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
  }

  if ($restartProcess.ExitCode -ne 0) {
    $restartText = ($restartOutput -join " | ").Trim()
    throw $(if ($restartText) { $restartText } else { "WinSW restart exited with code $($restartProcess.ExitCode)." })
  }

  $service = Get-Service -Name $ServiceName -ErrorAction Stop
  $serviceDeadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 2
    $service.Refresh()
    if ($service.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Running) {
      break
    }
  } while ((Get-Date) -lt $serviceDeadline)

  if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Running) {
    throw "Windows service $ServiceName did not return to Running state after restart."
  }

  $deadline = (Get-Date).AddSeconds(30)
  do {
    try {
      $response = Invoke-RestMethod -UseBasicParsing -Uri $HealthUrl -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 5
      if ($response.status -eq "ok" -and $response.service -eq "LocalArchiveMaintainer") {
        [pscustomobject]@{
          ok = $true
          summary = "Restarted Local Archive Maintainer and restored http://127.0.0.1:8787/health"
          controlTargetId = $ControlTargetId
          action = $Action
          serviceState = [string]$service.Status
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
