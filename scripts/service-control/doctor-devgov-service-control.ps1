param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "devgov-service-control" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$HealthUrl = "http://127.0.0.1:3201/health"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source

$healthOk = $false
try {
  $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
  $healthOk = ($health.ok -eq $true -and $health.project -eq "devgov" -and $health.service -eq "service-control-http")
} catch {
  $healthOk = $false
}

Push-Location $RepoRoot
try {
  & $NpmCommand run validate:registry | Out-Null
} finally {
  Pop-Location
}

$summary = if ($healthOk) {
  "DevGov service-control listener is healthy at $HealthUrl and registries validate."
} else {
  "DevGov service-control listener did not return the expected health payload at $HealthUrl."
}

[pscustomobject]@{
  ok = $healthOk
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $healthOk) {
  exit 1
}
