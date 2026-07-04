param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "mcp-colorgeek" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "Q:\Projects\chatgpt-local-files-mcp"
$StatusScript = Join-Path $TargetRoot "scripts\status-production.ps1"
$OriginHealthUrl = "http://127.0.0.1:43189/health"
$PublicHealthUrl = "https://mcp.colorgeek.co/health"

function Test-HttpOk {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "chatgpt-local-files-mcp project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $StatusScript)) {
  throw "chatgpt-local-files-mcp status script not found: $StatusScript"
}

Push-Location $TargetRoot
try {
  & $StatusScript -SkipAuditCanary | Out-Null
} finally {
  Pop-Location
}

$originOk = Test-HttpOk -Url $OriginHealthUrl
$publicOk = Test-HttpOk -Url $PublicHealthUrl
if (-not ($originOk -and $publicOk)) {
  [pscustomobject]@{
    ok = $false
    summary = "ChatGPT local-files MCP doctor found unhealthy health probes. origin=$originOk public=$publicOk"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = "ChatGPT local-files MCP doctor passed for origin and public /health probes."
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
