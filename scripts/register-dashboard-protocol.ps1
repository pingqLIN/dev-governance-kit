[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProtocolRoot = "HKCU:\Software\Classes\devgov"
$CommandRoot = Join-Path $ProtocolRoot "shell\open\command"
$BackupDir = Join-Path $RepoRoot "reports\registry-backups"

function Backup-ExistingProtocol {
  if (-not (Test-Path -LiteralPath $ProtocolRoot)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = Join-Path $BackupDir "devgov-protocol-$timestamp.reg"
  & reg.exe export "HKCU\Software\Classes\devgov" $backupPath /y | Out-Null
  Write-Host "Backed up existing devgov protocol registration to $backupPath"
}

if ($Remove) {
  if (Test-Path -LiteralPath $ProtocolRoot) {
    Backup-ExistingProtocol
    if ($PSCmdlet.ShouldProcess($ProtocolRoot, "Remove DevGov dashboard URL protocol")) {
      Remove-Item -LiteralPath $ProtocolRoot -Recurse
    }
  }
  return
}

Backup-ExistingProtocol
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$RepoRoot\scripts\start-dashboard.ps1`" -Open"

if ($PSCmdlet.ShouldProcess($ProtocolRoot, "Register DevGov dashboard URL protocol")) {
  New-Item -Path $CommandRoot -Force | Out-Null
  New-ItemProperty -Path $ProtocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
  Set-Item -Path $ProtocolRoot -Value "URL:DevGov Dashboard"
  Set-Item -Path $CommandRoot -Value $command
  Write-Host "Registered devgov://open"
}
