param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "video-render-kit-web" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$TargetRoot = "Q:\Projects\video-render-kit"
$Port = if ($env:VIDEO_RENDER_KIT_PORT) { [int]$env:VIDEO_RENDER_KIT_PORT } else { 5001 }
$BindHost = if ($env:VIDEO_RENDER_KIT_HOST) { $env:VIDEO_RENDER_KIT_HOST } else { "127.0.0.1" }
$StateUrl = "http://$BindHost`:$Port/api/state"

$ServerScript = Join-Path $TargetRoot "web\server.py"
$Python = (Get-Command python -ErrorAction SilentlyContinue).Source
$Ffmpeg = Join-Path $TargetRoot "bin\ffmpeg.exe"
$Ffprobe = Join-Path $TargetRoot "bin\ffprobe.exe"

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  throw "Video Render Kit root not found: $TargetRoot"
}

if (-not (Test-Path -LiteralPath $ServerScript)) {
  throw "Server script not found: $ServerScript"
}

if (-not $Python) {
  throw "Python executable not found in PATH."
}

if (-not (Test-Path -LiteralPath $Ffmpeg) -or -not (Test-Path -LiteralPath $Ffprobe)) {
  throw "Required binary missing (ffmpeg/ffprobe)."
}

function Test-VideoRenderKitState {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $StateUrl -TimeoutSec 5
    if ($response.StatusCode -ne 200) {
      return $null
    }
    return ($response.Content | ConvertFrom-Json)
  } catch {
    return $null
  }
}

$state = Test-VideoRenderKitState

$summaryParts = @()
if ($state -and $state.ffmpegExists -and $state.ffprobeExists) {
  $summary = "Video Render Kit doctor passed. Service is healthy on $StateUrl."
  $ok = $true
} elseif ($state) {
  if (-not $state.ffmpegExists) {
    $summaryParts += "ffmpeg not found"
  }
  if (-not $state.ffprobeExists) {
    $summaryParts += "ffprobe not found"
  }
  $summary = "Video Render Kit state endpoint responded, but dependency checks failed: " + ($summaryParts -join "; ")
  $ok = $false
} else {
  $summary = "Video Render Kit state endpoint is not reachable at $StateUrl."
  $ok = $false
}

[pscustomobject]@{
  ok = [bool]$ok
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $ok) {
  exit 1
}
