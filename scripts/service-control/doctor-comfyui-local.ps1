param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "comfyui-local" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$ProjectRoot = "Q:\Projects\ComfyUI"
$DoctorScript = Join-Path $ProjectRoot "scripts\service-control\doctor-comfyui-local.ps1"

if (-not (Test-Path -LiteralPath $DoctorScript)) {
  throw "ComfyUI doctor script not found: $DoctorScript"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DoctorScript -ControlTargetId $ControlTargetId -Action $Action
exit $LASTEXITCODE
