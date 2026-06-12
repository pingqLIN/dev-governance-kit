param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "taste" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "Q:\Projects\taste"
$CheckScript = Join-Path $TargetRoot "scripts\check-runtime.mjs"

if (-not (Test-Path -LiteralPath $CheckScript)) {
  throw "Taste runtime check script not found: $CheckScript"
}

$output = & node $CheckScript 2>&1
$jsonText = ($output | Out-String).Trim()

try {
  $parsed = $jsonText | ConvertFrom-Json
} catch {
  throw ($jsonText | Out-String).Trim()
}

$failedChecks = @($parsed.results | Where-Object { -not $_.ok } | Select-Object -ExpandProperty key)
$summary = if ($parsed.ok) {
  "Taste runtime check passed for local and public endpoints."
} else {
  "Taste runtime check failed: " + ($failedChecks -join ", ")
}

[pscustomobject]@{
  ok = [bool]$parsed.ok
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $parsed.ok) {
  exit 1
}
