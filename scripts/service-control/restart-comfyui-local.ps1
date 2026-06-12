param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "comfyui-local" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$ProjectRoot = "Q:\Projects\ComfyUI"
$RestartScript = Join-Path $ProjectRoot "scripts\service-control\restart-comfyui-local.ps1"

if (-not (Test-Path -LiteralPath $RestartScript)) {
  throw "ComfyUI restart script not found: $RestartScript"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RestartScript -ControlTargetId $ControlTargetId -Action $Action
exit $LASTEXITCODE
