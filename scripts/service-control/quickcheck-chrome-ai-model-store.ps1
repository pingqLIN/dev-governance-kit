$ErrorActionPreference = "Stop"

$ManagerScript = Join-Path $PSScriptRoot "Manage-ChromeAiModelStore.ps1"
if (-not (Test-Path -LiteralPath $ManagerScript)) {
  throw "Chrome AI model store manager script not found."
}

$output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ManagerScript -Mode Doctor 2>&1
$jsonText = ($output | Out-String).Trim()
$parsed = $jsonText | ConvertFrom-Json

[pscustomobject]@{
  ok = [bool]$parsed.ok
  summary = [string]$parsed.summary
  warnings = @($parsed.warnings)
  issues = @($parsed.issues)
} | ConvertTo-Json -Compress

if (-not [bool]$parsed.ok) {
  exit 1
}
