[CmdletBinding()]
param(
  [string]$Path = "",

  [string]$ProjectRoot = "",

  [string]$Product = "Unknown",

  [string]$AlertText = "",

  [string]$RebuildCommand = "",

  [string]$Run = "",

  [ValidateSet("Markdown", "Json")]
  [string]$OutputFormat = "Markdown",

  [string]$Out = "reports/antivirus-triage.md",

  [switch]$IncludeDefenderPreview,

  [switch]$NoDefenderEvidence,

  [switch]$PassThruExitCode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-ReportOutputPath {
  param([Parameter(Mandatory = $true)][string]$OutPath)

  $reportsRoot = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) "reports")).TrimEnd('\', '/')
  $resolved = [System.IO.Path]::GetFullPath($OutPath).TrimEnd('\', '/')
  $reportsPrefix = $reportsRoot + [System.IO.Path]::DirectorySeparatorChar

  if ([string]::Equals($resolved, $reportsRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $resolved.StartsWith($reportsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write antivirus hook evidence outside reports/."
  }
}

function Test-AntivirusTriggerText {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $false
  }

  return $Text -match '(?i)\b(antivirus|anti-virus|endpoint protection|defender|bitdefender|quarantine|quarantined|blocked|disinfected|threat detected|malware|ransomware|backdoor|trojan|tamper|tampering|credential theft|suspicious network)\b'
}

function Invoke-CapturedCommand {
  param([Parameter(Mandatory = $true)][string]$CommandLine)

  $reportsDir = Join-Path (Get-Location) "reports"
  New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null
  $logPath = Join-Path $reportsDir "antivirus-hook-command.log"

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/d /s /c `"$CommandLine`""
  $psi.WorkingDirectory = (Get-Location).Path
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  $combined = @(
    "Command: $CommandLine",
    "ExitCode: $($process.ExitCode)",
    "",
    "## stdout",
    $stdout,
    "",
    "## stderr",
    $stderr
  ) -join [Environment]::NewLine

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($logPath), $combined, $utf8NoBom)

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
    Combined = $combined
    LogPath = $logPath
  }
}

Assert-ReportOutputPath -OutPath $Out

$commandResult = $null
$triggerEvidence = @()
if (-not [string]::IsNullOrWhiteSpace($Run)) {
  $commandResult = Invoke-CapturedCommand -CommandLine $Run
  if ($commandResult.ExitCode -ne 0 -and (Test-AntivirusTriggerText -Text $commandResult.Combined)) {
    $triggerEvidence += "command-output"
  }
}

if (Test-AntivirusTriggerText -Text $AlertText) {
  $triggerEvidence += "alert-text"
}

if (-not [string]::IsNullOrWhiteSpace($Path)) {
  $triggerEvidence += "path-supplied"
}

if ($Product -match '(?i)defender|bitdefender|antivirus|endpoint') {
  $triggerEvidence += "product"
}

if ($triggerEvidence.Count -eq 0) {
  Write-Output "Codex antivirus hook did not trigger. No triage report was written."
  if ($PassThruExitCode -and $null -ne $commandResult) {
    exit $commandResult.ExitCode
  }
  exit 0
}

$triagePath = if ([string]::IsNullOrWhiteSpace($Path)) { "." } else { $Path }
$triageAlert = $AlertText
if ($null -ne $commandResult) {
  $triageAlert = (($AlertText, "Hook trigger evidence: $($triggerEvidence -join ', ')", "Command log: $($commandResult.LogPath)") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join " | "
}

$triageArgs = @{
  Path = @($triagePath)
  ProjectRoot = $ProjectRoot
  Product = $Product
  AlertText = $triageAlert
  RebuildCommand = $RebuildCommand
  OutputFormat = $OutputFormat
  Out = $Out
}

if ($IncludeDefenderPreview) {
  $triageArgs.IncludeDefenderPreview = $true
}

if ($NoDefenderEvidence -or $Product -notmatch '(?i)\b(microsoft defender|windows defender|defender)\b' -or $Product -match '(?i)bitdefender') {
  $triageArgs.NoDefenderEvidence = $true
}

& (Join-Path $PSScriptRoot "Invoke-AntivirusTriage.ps1") @triageArgs

if ($PassThruExitCode -and $null -ne $commandResult) {
  exit $commandResult.ExitCode
}
