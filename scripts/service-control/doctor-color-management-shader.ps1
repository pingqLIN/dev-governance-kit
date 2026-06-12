param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "color-management-shader" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\color-management-Shader"
$ServerScript = Join-Path $TargetRoot "demo\display-shader-control-lab\server.py"
$HealthUrl = "http://127.0.0.1:4174/api/shaderglass/status"

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "color-management-Shader project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $ServerScript)) {
  throw "Display shader control lab server not found: $ServerScript"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

$portCheck = & node $PortCheckScript `
  --registry $RegistryPath `
  --project "color-management-Shader" `
  --service "display-shader-control-lab-http" `
  --host "127.0.0.1" `
  --port "4174" `
  --protocol "http" `
  --allow-occupied `
  --json 2>&1

$portCheckText = ($portCheck | Out-String).Trim()
try {
  $portStatus = $portCheckText | ConvertFrom-Json
} catch {
  throw ($portCheckText | Out-String).Trim()
}

if (-not $portStatus.ok) {
  [pscustomobject]@{
    ok = $false
    summary = "Governed port check failed for Display Shader Control Lab."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

$syntaxOk = $true
$syntaxError = ""
try {
  & python -m py_compile $ServerScript 2>&1 | Out-Null
} catch {
  $syntaxOk = $false
  $syntaxError = $_.Exception.Message
}

$healthOk = $false
$bridgeState = ""
$shaderGlassExeFound = $false
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
  $payload = $response.Content | ConvertFrom-Json
  $bridgeState = [string]$payload.bridge
  $shaderGlassExeFound = [bool]$payload.shaderGlassExeFound
  $healthOk = ($response.StatusCode -eq 200 -and $bridgeState -eq "ready")
} catch {
  $healthOk = $false
}

$summary = if ($healthOk -and $syntaxOk) {
  if ($shaderGlassExeFound) {
    "Display Shader Control Lab is healthy and ShaderGlass bridge is discoverable."
  } else {
    "Display Shader Control Lab is healthy. ShaderGlass executable is not currently discoverable."
  }
} elseif (-not $syntaxOk) {
  "Display Shader Control Lab server syntax check failed: $syntaxError"
} else {
  "Display Shader Control Lab is not responding on $HealthUrl."
}

[pscustomobject]@{
  ok = ($healthOk -and $syntaxOk)
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not ($healthOk -and $syntaxOk)) {
  exit 1
}
