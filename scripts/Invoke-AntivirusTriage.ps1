[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$Path,

  [string]$ProjectRoot = "",

  [string]$Product = "Microsoft Defender",

  [string]$AlertText = "",

  [string]$RebuildCommand = "",

  [ValidateSet("Markdown", "Json")]
  [string]$OutputFormat = "Markdown",

  [string]$Out = "reports/antivirus-triage.md",

  [switch]$IncludeDefenderPreview,

  [switch]$NoDefenderEvidence
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-LocalPath {
  param([Parameter(Mandatory = $true)][string]$RawPath)

  $expanded = [Environment]::ExpandEnvironmentVariables($RawPath.Trim())
  if (Test-Path -LiteralPath $expanded) {
    return (Resolve-Path -LiteralPath $expanded).ProviderPath
  }

  try {
    return [System.IO.Path]::GetFullPath($expanded)
  } catch {
    return $expanded
  }
}

function Test-IsSameOrChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Child,
    [Parameter(Mandatory = $true)][string]$Parent
  )

  $childFull = Normalize-LocalPath -RawPath $Child
  $parentFull = Normalize-LocalPath -RawPath $Parent
  $comparison = [StringComparison]::OrdinalIgnoreCase

  if ([string]::Equals($childFull.TrimEnd('\', '/'), $parentFull.TrimEnd('\', '/'), $comparison)) {
    return $true
  }

  $parentPrefix = $parentFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  return $childFull.StartsWith($parentPrefix, $comparison)
}

function Get-PathSegments {
  param([Parameter(Mandatory = $true)][string]$FullPath)
  return $FullPath -split '[\\/]' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function ConvertTo-PowerShellSingleQuoted {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Escape-MarkdownCell {
  param([string]$Value)
  $text = if ($null -eq $Value) { "" } else { $Value }
  return ($text -replace '\|', '\|' -replace "`r?`n", " ")
}

function Test-HasGeneratedSegment {
  param([Parameter(Mandatory = $true)][string[]]$Segments)

  $generatedNames = @(
    "dist", "build", "out", ".next", ".nuxt", ".vite", ".turbo",
    ".parcel-cache", "target", "obj", "coverage", "test-results",
    "playwright-report", ".pytest_cache", "__pycache__", ".cache",
    ".tmp", "tmp", ".demo-cache", "artifacts", "generated"
  )

  foreach ($segment in $Segments) {
    if ($generatedNames -contains $segment.ToLowerInvariant()) {
      return $true
    }
  }

  for ($index = 0; $index -lt ($Segments.Count - 1); $index++) {
    $current = $Segments[$index].ToLowerInvariant()
    $next = $Segments[$index + 1].ToLowerInvariant()
    if ($current -eq "bin" -and ($next -eq "debug" -or $next -eq "release")) {
      return $true
    }
  }

  return $false
}

function Test-IsCommonInterpreter {
  param([Parameter(Mandatory = $true)][string]$FullPath)

  $leaf = [System.IO.Path]::GetFileName($FullPath).ToLowerInvariant()
  return @(
    "powershell.exe",
    "pwsh.exe",
    "cmd.exe",
    "node.exe",
    "python.exe",
    "python3.exe",
    "chrome.exe"
  ) -contains $leaf
}

function Test-IsBroadOrSensitiveScope {
  param(
    [Parameter(Mandatory = $true)][string]$FullPath,
    [string]$NormalizedProjectRoot
  )

  $trimmed = $FullPath.TrimEnd('\', '/')
  $sensitiveRoots = @(
    [Environment]::GetFolderPath("UserProfile"),
    [Environment]::GetFolderPath("Desktop"),
    [Environment]::GetFolderPath("MyDocuments"),
    [Environment]::GetFolderPath("LocalApplicationData"),
    [Environment]::GetFolderPath("ApplicationData"),
    [System.IO.Path]::GetTempPath()
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($root in $sensitiveRoots) {
    if ([string]::Equals($trimmed, $root.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($NormalizedProjectRoot)) {
    if ([string]::Equals($trimmed, $NormalizedProjectRoot.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  if ($trimmed -match '^[A-Za-z]:$') {
    return $true
  }

  $segments = @(Get-PathSegments -FullPath $trimmed | ForEach-Object { $_.ToLowerInvariant() })
  $blockedSegments = @(".git", "src", "source", "lib", "app", "node_modules", ".venv", "venv")
  foreach ($segment in $segments) {
    if ($blockedSegments -contains $segment) {
      return $true
    }
  }

  return Test-IsCommonInterpreter -FullPath $trimmed
}

function Test-SevereAlert {
  param([string]$Text)

  return $Text -match '(?i)credential theft|ransomware|backdoor|persistence|obfuscation|injection|tamper|tampering|suspicious network|keylogger|trojan|remote access'
}

function Assert-ReportOutputPath {
  param([Parameter(Mandatory = $true)][string]$OutPath)

  $reportsRoot = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) "reports")).TrimEnd('\', '/')
  $resolved = [System.IO.Path]::GetFullPath($OutPath).TrimEnd('\', '/')
  $reportsPrefix = $reportsRoot + [System.IO.Path]::DirectorySeparatorChar

  if ([string]::Equals($resolved, $reportsRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $resolved.StartsWith($reportsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write antivirus triage evidence outside reports/."
  }
}

function Get-DefenderEvidence {
  if ($Product -notmatch '(?i)\b(microsoft defender|windows defender|defender)\b' -or $Product -match '(?i)bitdefender') {
    return [ordered]@{
      product = $Product
      status = "skipped-non-defender-product"
      threat_detections = @()
      exclusions = [ordered]@{}
      errors = @()
    }
  }

  if ($NoDefenderEvidence) {
    return [ordered]@{
      product = $Product
      status = "skipped"
      threat_detections = @()
      exclusions = [ordered]@{}
      errors = @()
    }
  }

  $errors = @()
  $detections = @()
  $exclusions = [ordered]@{}

  try {
    $detections = @(Get-MpThreatDetection -ErrorAction Stop | Select-Object -First 20 ThreatName, Resources, InitialDetectionTime, LastThreatStatusChangeTime, ActionSuccess, CurrentThreatExecutionStatus)
  } catch {
    $errors += "Get-MpThreatDetection unavailable: $($_.Exception.Message)"
  }

  try {
    $preference = Get-MpPreference -ErrorAction Stop
    $exclusions = [ordered]@{
      ExclusionPath = @($preference.ExclusionPath)
      ExclusionProcess = @($preference.ExclusionProcess)
      ExclusionExtension = @($preference.ExclusionExtension)
    }
  } catch {
    $errors += "Get-MpPreference unavailable: $($_.Exception.Message)"
  }

  return [ordered]@{
    product = $Product
    status = if ($errors.Count -eq 0) { "collected" } else { "partial" }
    threat_detections = @($detections)
    exclusions = $exclusions
    errors = @($errors)
  }
}

function New-Recommendation {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [string]$NormalizedProjectRoot,
    [bool]$SevereAlert
  )

  $normalized = Normalize-LocalPath -RawPath $InputPath
  $exists = Test-Path -LiteralPath $normalized
  $item = if ($exists) { Get-Item -LiteralPath $normalized -Force } else { $null }
  $isDirectory = $exists -and $item.PSIsContainer
  $segments = @(Get-PathSegments -FullPath $normalized)
  $hasGeneratedSegment = Test-HasGeneratedSegment -Segments $segments
  $underProjectRoot = $false
  if (-not [string]::IsNullOrWhiteSpace($NormalizedProjectRoot)) {
    $underProjectRoot = Test-IsSameOrChildPath -Child $normalized -Parent $NormalizedProjectRoot
  }

  $hash = ""
  if ($exists -and -not $isDirectory) {
    try {
      $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $normalized -ErrorAction Stop).Hash
    } catch {
      $hash = "unavailable: $($_.Exception.Message)"
    }
  }

  $result = [ordered]@{
    input_path = $InputPath
    normalized_path = $normalized
    exists = $exists
    sha256 = $hash
    decision = "hold"
    classification = "suspicious-or-unknown"
    candidate_scope = ""
    scope_type = "none"
    reason = ""
    rebuild_command = $RebuildCommand
    risk = "medium"
    defender_preview = ""
  }

  if ($SevereAlert) {
    $result.decision = "triage"
    $result.classification = "real-security-triage"
    $result.reason = "The alert text names high-risk behavior. Do not plan an allowlist until security triage clears it."
    $result.risk = "high"
    return [pscustomobject]$result
  }

  if (Test-IsBroadOrSensitiveScope -FullPath $normalized -NormalizedProjectRoot $NormalizedProjectRoot) {
    $result.decision = "reject"
    $result.reason = "The path is too broad, sensitive, source-like, or a common interpreter for an antivirus exclusion."
    $result.risk = "high"
    return [pscustomobject]$result
  }

  if (-not $hasGeneratedSegment) {
    $result.reason = "No explicit generated or rebuildable path segment was detected. Keep this in review until rebuild evidence is available."
    return [pscustomobject]$result
  }

  if (-not [string]::IsNullOrWhiteSpace($NormalizedProjectRoot) -and -not $underProjectRoot) {
    $result.reason = "The path appears generated, but it is outside the supplied project root. Review manually before proposing an exclusion."
    $result.risk = "high"
    return [pscustomobject]$result
  }

  $result.decision = "candidate"
  $result.classification = "generated-artifact-false-positive-candidate"
  $result.candidate_scope = $normalized
  $result.scope_type = if ($isDirectory) { "directory" } else { "file" }
  $result.reason = "The path is narrow and includes an explicit generated or rebuildable segment."
  $result.risk = if ([string]::IsNullOrWhiteSpace($RebuildCommand)) { "medium" } else { "low" }

  if ($IncludeDefenderPreview) {
    $quoted = ConvertTo-PowerShellSingleQuoted -Value $normalized
    $result.defender_preview = "# DRY RUN ONLY - do not execute without explicit operator approval.`n# Add-MpPreference -ExclusionPath $quoted"
  }

  return [pscustomobject]$result
}

function Render-MarkdownReport {
  param(
    [Parameter(Mandatory = $true)]$Evidence,
    [Parameter(Mandatory = $true)][object[]]$Recommendations,
    [string]$NormalizedProjectRoot,
    [bool]$SevereAlert
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("# Antivirus triage dry-run")
  $lines.Add("")
  $lines.Add("- Dry-run only: no antivirus, endpoint, firewall, browser, or OS security settings were changed.")
  $lines.Add("- Protection stays enabled. This report does not recommend disabling real-time protection or endpoint agents.")
  $lines.Add("- Product: $Product")
  if (-not [string]::IsNullOrWhiteSpace($AlertText)) { $lines.Add("- Alert: $(Escape-MarkdownCell $AlertText)") }
  if (-not [string]::IsNullOrWhiteSpace($NormalizedProjectRoot)) { $lines.Add("- Project root: " + '`' + $NormalizedProjectRoot + '`') }
  if (-not [string]::IsNullOrWhiteSpace($RebuildCommand)) { $lines.Add("- Rebuild proof command: " + '`' + $RebuildCommand + '`') }
  $lines.Add("- Defender evidence: $($Evidence.status)")
  foreach ($errorText in @($Evidence.errors)) {
    $lines.Add("  - $errorText")
  }
  if ($SevereAlert) {
    $lines.Add("- Classification: real security triage. No allowlist candidates are proposed.")
  }

  $lines.Add("")
  $lines.Add("## Candidate allowlist table")
  $lines.Add("")
  $lines.Add("| Decision | Classification | Scope | Path | Risk | Rebuild proof | Reason |")
  $lines.Add("| --- | --- | --- | --- | --- | --- | --- |")
  foreach ($recommendation in $Recommendations) {
    $scope = if ([string]::IsNullOrWhiteSpace($recommendation.candidate_scope)) { "none" } else { $recommendation.scope_type }
    $pathValue = if ([string]::IsNullOrWhiteSpace($recommendation.candidate_scope)) { $recommendation.normalized_path } else { $recommendation.candidate_scope }
    $rebuild = if ([string]::IsNullOrWhiteSpace($recommendation.rebuild_command)) { "not supplied" } else { $recommendation.rebuild_command }
    $lines.Add("| $(Escape-MarkdownCell $recommendation.decision) | $(Escape-MarkdownCell $recommendation.classification) | $(Escape-MarkdownCell $scope) | " + '`' + "$(Escape-MarkdownCell $pathValue)" + '`' + " | $(Escape-MarkdownCell $recommendation.risk) | " + '`' + "$(Escape-MarkdownCell $rebuild)" + '`' + " | $(Escape-MarkdownCell $recommendation.reason) |")
  }

  $hashes = @($Recommendations | Where-Object { -not [string]::IsNullOrWhiteSpace($_.sha256) })
  if ($hashes.Count -gt 0) {
    $lines.Add("")
    $lines.Add("## File hashes")
    $lines.Add("")
    $lines.Add("| Path | SHA256 |")
    $lines.Add("| --- | --- |")
    foreach ($recommendation in $hashes) {
      $lines.Add("| " + '`' + "$(Escape-MarkdownCell $recommendation.normalized_path)" + '`' + " | " + '`' + "$(Escape-MarkdownCell $recommendation.sha256)" + '`' + " |")
    }
  }

  $lines.Add("")
  $lines.Add("## Rejected broad scopes")
  $lines.Add("")
  $lines.Add('- Drive roots, user profiles, Downloads/Desktop/AppData/temp roots, project roots, credential stores, browser profiles, `.git`, `src`, `lib`, `app`, entire `node_modules`, and global interpreter or browser processes are rejected by default.')
  $lines.Add("- If the alert names credential theft, ransomware, backdoor, persistence, obfuscation, injection, tampering, or suspicious network behavior, keep this in security triage instead of allowlisting.")

  $previewCommands = @($Recommendations | Where-Object { -not [string]::IsNullOrWhiteSpace($_.defender_preview) })
  if ($previewCommands.Count -gt 0) {
    $lines.Add("")
    $lines.Add("## Preview commands")
    $lines.Add("")
    $lines.Add('```powershell')
    foreach ($recommendation in $previewCommands) {
      $lines.Add($recommendation.defender_preview)
    }
    $lines.Add('```')
  }

  $lines.Add("")
  $lines.Add("## Apply gate")
  $lines.Add("")
  $lines.Add("Applying any exclusion requires a separate explicit operator request, a fresh evidence check, and verification that the exact target remains narrow and rebuildable.")

  return ($lines -join [Environment]::NewLine) + [Environment]::NewLine
}

$normalizedRoot = ""
if (-not [string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $normalizedRoot = Normalize-LocalPath -RawPath $ProjectRoot
}

Assert-ReportOutputPath -OutPath $Out
$severeAlertDetected = Test-SevereAlert -Text $AlertText
$defenderEvidence = Get-DefenderEvidence
$recommendations = @($Path | ForEach-Object {
  New-Recommendation -InputPath $_ -NormalizedProjectRoot $normalizedRoot -SevereAlert $severeAlertDetected
})

$report = if ($OutputFormat -eq "Json") {
  ([pscustomobject]@{
    dry_run_only = $true
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    product = $Product
    alert_text = $AlertText
    project_root = $normalizedRoot
    severe_alert_detected = $severeAlertDetected
    defender_evidence = $defenderEvidence
    recommendations = @($recommendations)
  } | ConvertTo-Json -Depth 8) + [Environment]::NewLine
} else {
  Render-MarkdownReport -Evidence $defenderEvidence -Recommendations $recommendations -NormalizedProjectRoot $normalizedRoot -SevereAlert $severeAlertDetected
}

$outParent = Split-Path -Parent $Out
if (-not [string]::IsNullOrWhiteSpace($outParent)) {
  New-Item -ItemType Directory -Force -Path $outParent | Out-Null
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Out), $report, $utf8NoBom)
Write-Output "Antivirus triage dry-run written to $Out"
