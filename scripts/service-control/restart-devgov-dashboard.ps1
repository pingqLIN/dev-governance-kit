param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "devgov-dashboard" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$result = & node "scripts/open-dashboard.mjs" 2>$null

[pscustomobject]@{
  ok = $true
  summary = "Ensured DevGov dashboard is running at $result"
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
