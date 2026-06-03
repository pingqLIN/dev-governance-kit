param(
  [switch]$Open
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$CloudflaredConfig = Join-Path $env:USERPROFILE ".cloudflared\devgov-gov-config.yml"
$CloudflaredExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$OriginUrl = "http://127.0.0.1:3000/health"
$PublicUrl = "https://gov.colorgeek.co/health"

function Test-HttpOk {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-ProcessCommandLineContains {
  param([string]$Needle)

  $processes = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue
  return [bool]($processes | Where-Object { $_.CommandLine -like "*$Needle*" } | Select-Object -First 1)
}

if (-not (Test-Path -LiteralPath $CloudflaredConfig)) {
  throw "Missing Cloudflare tunnel config: $CloudflaredConfig"
}

if (-not (Test-HttpOk -Url $OriginUrl)) {
  Start-Process -FilePath "node" `
    -ArgumentList @("scripts/serve-dashboard.mjs") `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden
}

if (-not (Test-ProcessCommandLineContains -Needle "devgov-gov-config.yml")) {
  Start-Process -FilePath $CloudflaredExe `
    -ArgumentList @("tunnel", "--config", $CloudflaredConfig, "--no-autoupdate", "run") `
    -WindowStyle Hidden
}

if ($Open) {
  Start-Sleep -Seconds 2
  Start-Process "https://gov.colorgeek.co/"
}

Write-Host "DevGov gov route requested. Origin=$OriginUrl Public=$PublicUrl"
