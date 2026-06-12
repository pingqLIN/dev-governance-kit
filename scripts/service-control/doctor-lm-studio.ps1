param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "lm-studio" -or $Action -ne "doctor") {
  throw "Unsupported control request: $ControlTargetId/$Action"
}

$LmsCli = "C:\Users\miles\AppData\Local\Programs\LM Studio\resources\app\.webpack\lms.exe"
$LocalModelsUrl = "http://127.0.0.1:1234/v1/models"
$PublicModelsUrl = "https://lmstudio.colorgeek.co/v1/models"

function Test-LmStudioEndpoint {
  param(
    [string]$Url,
    [int]$TimeoutSec = 8
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $LmsCli)) {
  throw "LM Studio CLI not found: $LmsCli"
}

$serverStatusOutput = & cmd.exe /d /c "`"$LmsCli`" server status 2>&1"
$serverStatusText = ($serverStatusOutput | Out-String).Trim()
$serverRunning = $serverStatusText -match "running"
$localOk = Test-LmStudioEndpoint -Url $LocalModelsUrl -TimeoutSec 5
$publicOk = Test-LmStudioEndpoint -Url $PublicModelsUrl -TimeoutSec 10

$summary = if ($localOk -and $publicOk) {
  "LM Studio API server is healthy on local and public /v1/models."
} elseif ($localOk) {
  "LM Studio local /v1/models is healthy, but the public route still fails."
} elseif ($serverRunning) {
  "LM Studio app reports the server is running, but /v1/models is not healthy yet."
} else {
  "LM Studio API server is not running."
}

[pscustomobject]@{
  ok = ($localOk -and $publicOk)
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not ($localOk -and $publicOk)) {
  exit 1
}
