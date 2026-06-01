[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$StartupDir = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "DevGov Gov Public Route.cmd"
$BackupDir = Join-Path $RepoRoot "reports\startup-backups"

function Backup-ExistingShortcut {
  if (-not (Test-Path -LiteralPath $ShortcutPath)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = Join-Path $BackupDir "DevGov Gov Public Route.$timestamp.cmd"
  Copy-Item -LiteralPath $ShortcutPath -Destination $backupPath -Force
  Write-Host "Backed up existing startup entry to $backupPath"
}

if ($Remove) {
  if (Test-Path -LiteralPath $ShortcutPath) {
    Backup-ExistingShortcut
    if ($PSCmdlet.ShouldProcess($ShortcutPath, "Remove DevGov gov public route startup entry")) {
      Remove-Item -LiteralPath $ShortcutPath
    }
  }
  return
}

$content = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$RepoRoot\scripts\start-gov-public-route.ps1"
"@

Backup-ExistingShortcut
if ($PSCmdlet.ShouldProcess($ShortcutPath, "Register DevGov gov public route startup entry")) {
  Set-Content -LiteralPath $ShortcutPath -Value $content -Encoding ASCII
  Write-Host "Registered startup entry: $ShortcutPath"
}
