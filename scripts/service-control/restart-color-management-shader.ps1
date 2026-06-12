param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "color-management-shader" -or $Action -ne "restart") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RegistryPath = Join-Path $WorkspaceRoot "registry\ports.registry.json"
$PortCheckScript = Join-Path $WorkspaceRoot "scripts\require-governed-port.mjs"
$TargetRoot = "Q:\Projects\color-management-Shader"
$ServerScript = Join-Path $TargetRoot "demo\display-shader-control-lab\server.py"
$PythonCommand = (Get-Command python -ErrorAction Stop).Source
$PowerShellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
$LogDir = Join-Path $WorkspaceRoot "reports\service-control-logs"
$StdoutLog = Join-Path $LogDir "display-shader-control-lab.stdout.log"
$StderrLog = Join-Path $LogDir "display-shader-control-lab.stderr.log"
$HealthUrl = "http://127.0.0.1:4174/api/shaderglass/status"

function Test-DisplayShaderControlLab {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    $payload = $response.Content | ConvertFrom-Json
    return ($response.StatusCode -eq 200 -and [string]$payload.bridge -eq "ready")
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "color-management-Shader project root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $ServerScript)) {
  throw "Display shader control lab server not found: $ServerScript"
}

if (-not (Test-Path -LiteralPath $PortCheckScript)) {
  throw "Governed port preflight script not found: $PortCheckScript"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedProcess = $false
if (-not (Test-DisplayShaderControlLab)) {
  $portCheck = & node $PortCheckScript `
    --registry $RegistryPath `
    --project "color-management-Shader" `
    --service "display-shader-control-lab-http" `
    --host "127.0.0.1" `
    --port "4174" `
    --protocol "http" `
    --json 2>&1

  $portCheckText = ($portCheck | Out-String).Trim()
  try {
    $portStatus = $portCheckText | ConvertFrom-Json
  } catch {
    throw ($portCheckText | Out-String).Trim()
  }

  if (-not $portStatus.ok) {
    throw "Governed port preflight failed for Display Shader Control Lab."
  }

  $childCommand = @(
    "Set-Location -LiteralPath '$TargetRoot'",
    "& '$PythonCommand' '$ServerScript' --host 127.0.0.1 --port 4174 --no-open-browser --browser-mode none 1>> '$StdoutLog' 2>> '$StderrLog'"
  ) -join "; "

  Start-Process -FilePath $PowerShellCommand `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $childCommand) `
    -WorkingDirectory $TargetRoot `
    -WindowStyle Hidden | Out-Null
  $startedProcess = $true

  $deadline = (Get-Date).AddSeconds(25)
  do {
    Start-Sleep -Seconds 2
    if (Test-DisplayShaderControlLab) {
      break
    }
  } while ((Get-Date) -lt $deadline)
}

if (-not (Test-DisplayShaderControlLab)) {
  [pscustomobject]@{
    ok = $false
    summary = "Display Shader Control Lab did not become healthy on $HealthUrl after the reviewed ensure-running attempt."
    controlTargetId = $ControlTargetId
    action = $Action
  } | ConvertTo-Json -Compress
  exit 1
}

[pscustomobject]@{
  ok = $true
  summary = $(if ($startedProcess) { "Started Display Shader Control Lab and confirmed the ShaderGlass bridge health endpoint." } else { "Display Shader Control Lab was already healthy." })
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress
