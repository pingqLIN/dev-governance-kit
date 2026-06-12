param(
  [Parameter(Mandatory = $true)]
  [string]$ControlTargetId,
  [Parameter(Mandatory = $true)]
  [string]$Action
)

$ErrorActionPreference = "Stop"

if ($ControlTargetId -ne "lm-studio" -or $Action -ne "restart") {
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

& cmd.exe /d /c "`"$LmsCli`" server start 2>&1" | Out-Null

$deadline = (Get-Date).AddSeconds(25)
do {
  Start-Sleep -Seconds 2
  $localOk = Test-LmStudioEndpoint -Url $LocalModelsUrl -TimeoutSec 5
  $publicOk = Test-LmStudioEndpoint -Url $PublicModelsUrl -TimeoutSec 10
  if ($localOk -and $publicOk) {
    break
  }
} while ((Get-Date) -lt $deadline)

$ok = ($localOk -and $publicOk)
$summary = if ($ok) {
  "Started LM Studio and confirmed local/public /v1/models."
} elseif ($localOk) {
  "LM Studio local /v1/models recovered, but the public route still fails."
} else {
  "LM Studio did not recover local /v1/models after the reviewed ensure-running attempt."
}

[pscustomobject]@{
  ok = $ok
  summary = $summary
  controlTargetId = $ControlTargetId
  action = $Action
} | ConvertTo-Json -Compress

if (-not $ok) {
  exit 1
}
