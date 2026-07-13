param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "continuous-memory-field" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ProjectsRoot = Split-Path -Parent $WorkspaceRoot
$TargetRoot = Join-Path $ProjectsRoot "memory-field\Continuous Memory Field"
$QuickcheckScript = Join-Path $PSScriptRoot "quickcheck-continuous-memory-field.ps1"
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $QuickcheckScript)) {
  throw "Continuous Memory Field quickcheck script not found."
}

$quickcheckOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $QuickcheckScript 2>&1
$quickcheckText = ($quickcheckOutput | Out-String).Trim()
try {
  $quickcheck = $quickcheckText | ConvertFrom-Json
} catch {
  throw ($quickcheckText | Out-String).Trim()
}

if (-not [bool]$quickcheck.ok) {
  [pscustomobject]@{
    ok = $false
    summary = "Continuous Memory Field doctor preflight failed: $($quickcheck.summary)"
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

Push-Location $TargetRoot
try {
  & $NpmCommand run typecheck | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Continuous Memory Field typecheck failed."
  }

  & $NpmCommand test | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Continuous Memory Field test suite failed."
  }
} finally {
  Pop-Location
}

[pscustomobject]@{
  ok = $true
  summary = "Continuous Memory Field doctor passed: project shape, typecheck, and test suite are healthy."
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
