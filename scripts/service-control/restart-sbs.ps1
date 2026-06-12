param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "sbs" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "Q:\Projects\sbs"
$DoctorScript = Join-Path $TargetRoot "scripts\proxy-doctor.mjs"

if (-not (Test-Path -LiteralPath $DoctorScript)) {
  throw "SBS proxy doctor script not found: $DoctorScript"
}

$output = & node $DoctorScript --start --json 2>&1
$jsonText = ($output | Out-String).Trim()

try {
  $parsed = $jsonText | ConvertFrom-Json
} catch {
  throw ($jsonText | Out-String).Trim()
}

$failedChecks = @($parsed.checks | Where-Object { $_.status -eq "fail" } | Select-Object -ExpandProperty name)
$warningChecks = @($parsed.checks | Where-Object { $_.status -eq "warn" } | Select-Object -ExpandProperty name)

$summary = if ($parsed.ok) {
  if ($warningChecks.Count -gt 0) {
    "SBS local proxy is healthy after ensure-running with warnings: " + ($warningChecks -join ", ")
  } else {
    "SBS local proxy is healthy after ensure-running."
  }
} else {
  "SBS proxy ensure-running failed: " + ($failedChecks -join ", ")
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
