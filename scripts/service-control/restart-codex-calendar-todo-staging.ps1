param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "codex-calendar-todo-staging" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$RuntimeRoot = "Q:\Projects\codex-calendar-todo-runtime"
$SourceRoot = "Q:\Projects\codex-calendar-todo"
$LocalHealthUrl = "http://127.0.0.1:4321/api/health"
$PublicHealthUrl = "https://codex-calendar-todo-staging.colorgeek.co/api/health"
$CloudflaredConfigPath = "C:\Users\miles\.cloudflared\tb2-prod-config.yml"
$PidPath = Join-Path $RuntimeRoot ".codex-runtime\persistent-server.pid"
$StdoutLog = Join-Path $RuntimeRoot ".codex-runtime\logs\persistent-server.out.log"
$StderrLog = Join-Path $RuntimeRoot ".codex-runtime\logs\persistent-server.err.log"
$DistServerPath = Join-Path $RuntimeRoot "dist-server\server\app.js"
$EnvLocalPath = Join-Path $RuntimeRoot ".env.local"

function Test-JsonHealth {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 5
  )

  try {
    $response = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSeconds
    return @{
      ok = [bool]$response.ok
      detail = "ok=$($response.ok)"
    }
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $message = if ($statusCode) {
      "status=$statusCode"
    } else {
      $_.Exception.Message
    }
    return @{
      ok = $false
      detail = $message
    }
  }
}

function Get-RouteTarget {
  if (-not (Test-Path -LiteralPath $CloudflaredConfigPath)) {
    return "config missing"
  }

  $lines = Get-Content -LiteralPath $CloudflaredConfigPath
  for ($index = 0; $index -lt $lines.Length; $index++) {
    if ($lines[$index] -match 'hostname:\s*codex-calendar-todo-staging\.colorgeek\.co') {
      for ($next = $index + 1; $next -lt [Math]::Min($index + 5, $lines.Length); $next++) {
        if ($lines[$next] -match 'service:\s*(.+)$') {
          return $Matches[1].Trim()
        }
      }
    }
  }

  return "service mapping missing"
}

function Start-RuntimeProcess {
  if (-not (Test-Path -LiteralPath $DistServerPath)) {
    throw "Runtime server artifact missing: $DistServerPath"
  }

  if (-not (Test-Path -LiteralPath $EnvLocalPath)) {
    throw "Runtime env file missing: $EnvLocalPath"
  }

  $logDir = Split-Path -Parent $StdoutLog
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  $previousPort = $env:PORT
  $env:PORT = "4321"
  try {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $process = Start-Process -FilePath $node `
      -ArgumentList @("--env-file-if-exists=.env.local", "dist-server/server/app.js") `
      -WorkingDirectory $RuntimeRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $StdoutLog `
      -RedirectStandardError $StderrLog `
      -PassThru
    Set-Content -LiteralPath $PidPath -Value $process.Id -Encoding ASCII
    return $process.Id
  } finally {
    if ($null -eq $previousPort) {
      Remove-Item Env:PORT -ErrorAction SilentlyContinue
    } else {
      $env:PORT = $previousPort
    }
  }
}

function Stop-RecordedProcess {
  if (-not (Test-Path -LiteralPath $PidPath)) {
    return
  }

  $rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
  if ($rawPid -notmatch '^\d+$') {
    return
  }

  $process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
  }
}

$localBefore = Test-JsonHealth -Url $LocalHealthUrl
$started = $false

if (-not $localBefore.ok) {
  Stop-RecordedProcess
  Start-RuntimeProcess | Out-Null
  $started = $true

  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Seconds 2
    $localAfter = Test-JsonHealth -Url $LocalHealthUrl
    if ($localAfter.ok) {
      break
    }
  } while ((Get-Date) -lt $deadline)
} else {
  $localAfter = $localBefore
}

if (-not $localAfter.ok) {
  [pscustomobject]@{
    ok = $false
    summary = "Codex Calendar Todo local runtime did not become healthy on 127.0.0.1:4321 ($($localAfter.detail))."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

$public = Test-JsonHealth -Url $PublicHealthUrl
$routeTarget = Get-RouteTarget
$summary = if ($public.ok) {
  if ($started) {
    "Restarted Codex Calendar Todo runtime and confirmed public staging health."
  } else {
    "Codex Calendar Todo runtime was already healthy and public staging health is passing."
  }
} else {
  "Local runtime is healthy on 127.0.0.1:4321, but public staging health still fails ($($public.detail)). Cloudflare currently targets $routeTarget."
}

[pscustomobject]@{
  ok = [bool]$public.ok
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
  routeTarget = $routeTarget
} | ConvertTo-Json -Compress

if (-not $public.ok) {
  exit 1
}
