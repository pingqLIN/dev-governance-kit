param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Resolve-DevGovProjectsRoot.ps1")

if ($ControlTargetId -ne "tunnel-client-local-filesystem-mcp" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TargetRoot = Join-Path (Resolve-DevGovProjectsRoot -WorkspaceRoot $WorkspaceRoot) "openai-mcp-tunnel"
$RuntimeScript = Join-Path $TargetRoot "scripts\tunnel-client\tunnel-client-runtime.ps1"

if (-not (Test-Path -LiteralPath $RuntimeScript)) {
  throw "Tunnel client runtime script not found: $RuntimeScript"
}

$output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RuntimeScript -Mode Doctor 2>&1
if ($LASTEXITCODE -ne 0) {
  throw (($output | Out-String).Trim())
}

[pscustomobject]@{
  ok = $true
  summary = "Tunnel client doctor passed for http://127.0.0.1:8080/readyz"
  controlTargetId = $ControlTargetId
  action = $Action
  output = ($output | Out-String).Trim()
} | ConvertTo-Json -Compress
