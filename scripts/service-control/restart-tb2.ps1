param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "tb2" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$StartScript = "Q:\Scripts\tb2-local-mcp.ps1"
$VerifyProdScript = "C:\dev\TB2\verify-runtime-prod.ps1"
$VerifyStagingScript = "C:\dev\TB2\verify-runtime-staging.ps1"
$LocalHealthUrl = "http://127.0.0.1:3189/health"
$PublicProdUrl = "https://tb2.colorgeek.co/health"
$PublicStagingUrl = "https://tb2-health-staging.colorgeek.co/health"
$CloudflaredConfigPath = "C:\Users\miles\.cloudflared\tb2-prod-config.yml"

function Test-Tb2Health {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 8
  )

  try {
    $response = Invoke-RestMethod -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSeconds
    return @{
      ok = [bool]($response.status -eq "ok")
      detail = if ($response.status) { "status=$($response.status)" } else { "ok" }
    }
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $message = if ($statusCode) { "status=$statusCode" } else { $_.Exception.Message }
    return @{
      ok = $false
      detail = $message
    }
  }
}

function Invoke-Step {
  param(
    [string]$ScriptPath
  )

  if (-not (Test-Path -LiteralPath $ScriptPath)) {
    return @{
      ok = $false
      detail = "missing script: $ScriptPath"
    }
  }

  try {
    $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
    $output = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $ScriptPath 2>&1
    return @{
      ok = $true
      detail = (($output | Out-String).Trim())
    }
  } catch {
    $detail = $_.Exception.Message
    if ($_.InvocationInfo.PositionMessage) {
      $detail = (($detail + " " + $_.InvocationInfo.PositionMessage) -replace "\s+", " ").Trim()
    }
    return @{
      ok = $false
      detail = $detail
    }
  }
}

function Get-RouteTarget {
  param(
    [string]$Hostname
  )

  if (-not (Test-Path -LiteralPath $CloudflaredConfigPath)) {
    return "config missing"
  }

  $lines = Get-Content -LiteralPath $CloudflaredConfigPath
  for ($index = 0; $index -lt $lines.Length; $index++) {
    if ($lines[$index] -match "hostname:\s*$([regex]::Escape($Hostname))") {
      for ($next = $index + 1; $next -lt [Math]::Min($index + 5, $lines.Length); $next++) {
        if ($lines[$next] -match 'service:\s*(.+)$') {
          return $Matches[1].Trim()
        }
      }
    }
  }

  return "service mapping missing"
}

$startResult = Invoke-Step -ScriptPath $StartScript
if (-not $startResult.ok) {
  [pscustomobject]@{
    ok = $false
    summary = "TB2 local MCP start failed: $($startResult.detail)"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

$deadline = (Get-Date).AddSeconds(25)
do {
  Start-Sleep -Seconds 2
  $local = Test-Tb2Health -Url $LocalHealthUrl
  if ($local.ok) {
    break
  }
} while ((Get-Date) -lt $deadline)

$verifyProd = Invoke-Step -ScriptPath $VerifyProdScript
$verifyStaging = Invoke-Step -ScriptPath $VerifyStagingScript
$publicProd = Test-Tb2Health -Url $PublicProdUrl
$publicStaging = Test-Tb2Health -Url $PublicStagingUrl
$prodRouteTarget = Get-RouteTarget -Hostname "tb2.colorgeek.co"
$stagingRouteTarget = Get-RouteTarget -Hostname "tb2-health-staging.colorgeek.co"

$ok = [bool]($local.ok -and $verifyProd.ok -and $verifyStaging.ok -and $publicProd.ok -and $publicStaging.ok)
$summary = if ($ok) {
  "Started TB2 local MCP and confirmed local /health plus public prod/staging health routes."
} else {
  $parts = @()
  $parts += "local-health=$($local.detail)"
  $parts += "verify-prod=$($verifyProd.ok)"
  $parts += "verify-staging=$($verifyStaging.ok)"
  $parts += "public-prod=$($publicProd.detail) via $prodRouteTarget"
  $parts += "public-staging=$($publicStaging.detail) via $stagingRouteTarget"
  "TB2 local MCP recovered only partially: " + ($parts -join "; ")
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
