param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "ps3eye-windows-virtual-camera" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$RepoRoot = "Q:\Projects\ps3eye-windows-virtual-camera"
$DoctorScript = Join-Path $RepoRoot "scripts\Test-Ps3EyeCameraDoctor.ps1"
if (-not (Test-Path -LiteralPath $DoctorScript)) {
  throw "PS3 Eye doctor script not found: $DoctorScript"
}

$output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DoctorScript 2>&1
$jsonText = ($output | Out-String).Trim()
$parsed = $jsonText | ConvertFrom-Json

$failedChecks = @($parsed.checks | Where-Object { -not $_.ok } | Select-Object -ExpandProperty id)
$summary = if ($parsed.ok) {
  "PS3 Eye virtual camera doctor passed."
} else {
  "PS3 Eye doctor failed: " + ($failedChecks -join ", ")
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
