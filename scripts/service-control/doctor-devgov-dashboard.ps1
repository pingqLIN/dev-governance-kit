param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "devgov-dashboard" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source

Push-Location $RepoRoot
try {
  & $NpmCommand run doctor | Out-Null
} finally {
  Pop-Location
}

[pscustomobject]@{
  ok = $true
  summary = "DevGov doctor passed for the local dashboard and registry surface."
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
