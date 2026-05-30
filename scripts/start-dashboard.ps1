param(
  [switch]$Open
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Start-Process -FilePath "node" `
  -ArgumentList @("scripts/open-dashboard.mjs") `
  -WorkingDirectory $RepoRoot `
  -WindowStyle Hidden

if ($Open) {
  Start-Sleep -Milliseconds 500
  Start-Process "http://127.0.0.1:3101"
}
