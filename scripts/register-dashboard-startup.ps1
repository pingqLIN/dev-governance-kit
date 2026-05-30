[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$StartupDir = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "DevGov Dashboard.cmd"

if ($Remove) {
  if (Test-Path -LiteralPath $ShortcutPath) {
    if ($PSCmdlet.ShouldProcess($ShortcutPath, "Remove DevGov dashboard startup entry")) {
      Remove-Item -LiteralPath $ShortcutPath
    }
  }
  return
}

$content = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$RepoRoot\scripts\start-dashboard.ps1"
"@

if ($PSCmdlet.ShouldProcess($ShortcutPath, "Register DevGov dashboard startup entry")) {
  Set-Content -LiteralPath $ShortcutPath -Value $content -Encoding ASCII
}
