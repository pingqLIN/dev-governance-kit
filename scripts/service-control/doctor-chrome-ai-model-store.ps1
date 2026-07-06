param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "chrome-ai-model-store" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$ManagerScript = Join-Path $PSScriptRoot "Manage-ChromeAiModelStore.ps1"
$output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ManagerScript -Mode Doctor 2>&1
$jsonText = ($output | Out-String).Trim()
$parsed = $jsonText | ConvertFrom-Json

[pscustomobject]@{
  ok = [bool]$parsed.ok
  summary = [string]$parsed.summary
  controlTargetId = $ControlTargetId
  action = $Action
  issues = @($parsed.issues)
  warnings = @($parsed.warnings)
} | ConvertTo-Json -Compress

if (-not [bool]$parsed.ok) {
  exit 1
}
