param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "codex-calendar-todo-staging" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$RuntimeRoot = "Q:\Projects\codex-calendar-todo-runtime"
$SourceRoot = "Q:\Projects\codex-calendar-todo"
$StatusScript = Join-Path $RuntimeRoot "scripts\runtime\status.ps1"
$LocalHealthUrl = "http://127.0.0.1:4321/api/health"
$PublicHealthUrl = "https://codex-calendar-todo-staging.colorgeek.co/api/health"
$CloudflaredConfigPath = "C:\Users\miles\.cloudflared\tb2-prod-config.yml"

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

if (-not (Test-Path -LiteralPath $StatusScript)) {
  throw "Runtime status script not found: $StatusScript"
}

$statusOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StatusScript -ProjectRoot $RuntimeRoot 2>&1
$statusText = ($statusOutput | Out-String).Trim()
$local = Test-JsonHealth -Url $LocalHealthUrl
$public = Test-JsonHealth -Url $PublicHealthUrl
$routeTarget = Get-RouteTarget

$summary = if ($local.ok -and $public.ok) {
  "Codex Calendar Todo staging local runtime and public route are healthy."
} elseif ($local.ok) {
  "Local runtime is healthy on 127.0.0.1:4321, but public staging health still fails ($($public.detail)). Cloudflare currently targets $routeTarget."
} else {
  "Local runtime health failed ($($local.detail)); public staging health is $($public.detail)."
}

[pscustomobject]@{
  ok = [bool]($local.ok -and $public.ok)
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
  routeTarget = $routeTarget
  status = $statusText
} | ConvertTo-Json -Compress

if (-not ($local.ok -and $public.ok)) {
  exit 1
}
