param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "photo-hdr-flow-web" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "Q:\Projects\photo-hdr-flow"
$Python = Join-Path $TargetRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
  throw "Photo HDR Flow venv python not found: $Python"
}

Push-Location $TargetRoot
try {
  $output = & $Python -m photo_hdr_flow doctor --json 2>&1
} finally {
  Pop-Location
}

$jsonText = ($output | Out-String).Trim()
try {
  $parsed = $jsonText | ConvertFrom-Json
} catch {
  throw ($jsonText | Out-String).Trim()
}

$summary = if ($parsed.ready) {
  "Photo HDR Flow doctor passed."
} else {
  $failed = @()
  foreach ($name in ($parsed.capabilities.PSObject.Properties.Name | Sort-Object)) {
    $cap = $parsed.capabilities.$name
    if (-not [bool]$cap.available) {
      $failed += $name
    }
  }
  if ($failed.Count -gt 0) {
    "Photo HDR Flow doctor failed: " + ($failed -join ", ")
  } else {
    "Photo HDR Flow doctor did not report ready."
  }
}

[pscustomobject]@{
  ok = [bool]$parsed.ready
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $parsed.ready) {
  exit 1
}
