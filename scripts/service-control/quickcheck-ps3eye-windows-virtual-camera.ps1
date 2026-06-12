param(
  [int]$FreshnessSeconds = 15
)

$ErrorActionPreference = "Stop"
$RepoRoot = "Q:\Projects\ps3eye-windows-virtual-camera"
$DoctorScript = Join-Path $RepoRoot "scripts\Test-Ps3EyeCameraDoctor.ps1"

if (-not (Test-Path -LiteralPath $DoctorScript)) {
  throw "PS3 Eye doctor script not found: $DoctorScript"
}

$output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DoctorScript -FreshnessSeconds $FreshnessSeconds 2>&1
$jsonText = ($output | Out-String).Trim()
$parsed = $jsonText | ConvertFrom-Json

$requiredChecks = @(
  "feeder-process",
  "vcam-process",
  "latest-frame-fresh",
  "virtual-camera-listed"
)

$checkMap = @{}
foreach ($check in @($parsed.checks)) {
  $checkMap[$check.id] = $check
}

$failed = @()
foreach ($requiredCheck in $requiredChecks) {
  if (-not $checkMap.ContainsKey($requiredCheck) -or -not [bool]$checkMap[$requiredCheck].ok) {
    $failed += $requiredCheck
  }
}

$ok = ($failed.Count -eq 0)
$summary = if ($ok) {
  "PS3 Eye quick health passed."
} else {
  "PS3 Eye quick health failed: " + ($failed -join ", ")
}

[pscustomobject]@{
  ok = $ok
  summary = $summary
  failedChecks = $failed
} | ConvertTo-Json -Compress

if (-not $ok) {
  exit 1
}
