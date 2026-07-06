param(
  [ValidateSet("Doctor", "Reset")]
  [string]$Mode = "Doctor",
  [switch]$IncludeMissingChannels,
  [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

$ModelDirectoryName = "OptGuideOnDeviceModel"
$Channels = @(
  @{ Name = "Stable"; Role = "primary"; RelativeRoot = "Google\Chrome\User Data" },
  @{ Name = "Beta"; Role = "linked"; RelativeRoot = "Google\Chrome Beta\User Data" },
  @{ Name = "Dev"; Role = "linked"; RelativeRoot = "Google\Chrome Dev\User Data" },
  @{ Name = "Canary"; Role = "linked"; RelativeRoot = "Google\Chrome SxS\User Data" }
)

function Normalize-PathValue {
  param([string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return ""
  }
  try {
    return [System.IO.Path]::GetFullPath($PathValue.TrimEnd("\"))
  } catch {
    return $PathValue.TrimEnd("\")
  }
}

function Test-SamePath {
  param(
    [string]$Left,
    [string]$Right
  )
  return [StringComparer]::OrdinalIgnoreCase.Equals((Normalize-PathValue $Left), (Normalize-PathValue $Right))
}

function Get-LinkTargetText {
  param($Item)
  if (-not $Item -or -not $Item.Target) {
    return ""
  }
  if ($Item.Target -is [array]) {
    return [string]($Item.Target | Select-Object -First 1)
  }
  return [string]$Item.Target
}

function Get-DirectorySize {
  param([string]$Path)
  try {
    $measure = Get-ChildItem -LiteralPath $Path -Force -Recurse -File -ErrorAction Stop |
      Measure-Object -Property Length -Sum
    if ($null -eq $measure.Sum) {
      return [int64]0
    }
    return [int64]$measure.Sum
  } catch {
    return $null
  }
}

function Get-ChromeAiModelStoreState {
  $primaryRoot = Join-Path $env:LOCALAPPDATA $Channels[0].RelativeRoot
  $primaryPath = Join-Path $primaryRoot $ModelDirectoryName
  $states = @()

  foreach ($channel in $Channels) {
    $root = Join-Path $env:LOCALAPPDATA $channel.RelativeRoot
    $modelPath = Join-Path $root $ModelDirectoryName
    $item = Get-Item -LiteralPath $modelPath -Force -ErrorAction SilentlyContinue
    $versions = @()
    $hasWeights = $false
    $bytes = $null

    if ($item -and (Test-Path -LiteralPath $modelPath)) {
      $versions = @(Get-ChildItem -LiteralPath $modelPath -Force -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne ".del" } |
        Select-Object -ExpandProperty Name)
      $hasWeights = [bool](Get-ChildItem -LiteralPath $modelPath -Force -Recurse -File -Filter "weights.bin" -ErrorAction SilentlyContinue |
        Select-Object -First 1)
      if ($channel.Role -eq "primary" -or -not $item.LinkType) {
        $bytes = Get-DirectorySize -Path $modelPath
      }
    }

    $target = Get-LinkTargetText -Item $item
    $states += [pscustomobject]@{
      name = $channel.Name
      role = $channel.Role
      rootExists = Test-Path -LiteralPath $root
      modelExists = [bool]$item
      path = $modelPath
      linkType = if ($item) { [string]$item.LinkType } else { "" }
      target = $target
      targetMatchesPrimary = if ($target) { Test-SamePath $target $primaryPath } else { $false }
      versions = $versions
      hasWeights = $hasWeights
      bytes = $bytes
    }
  }

  return [pscustomobject]@{
    primaryPath = $primaryPath
    channels = $states
  }
}

function Test-ChromeAiModelStoreState {
  param($State)

  $issues = @()
  $warnings = @()
  $primary = $State.channels | Where-Object { $_.role -eq "primary" } | Select-Object -First 1

  if (-not $primary.rootExists) {
    $issues += "Stable Chrome user-data root is missing."
  } elseif (-not $primary.modelExists) {
    $issues += "Stable primary model directory is missing."
  } else {
    if ($primary.linkType) {
      $issues += "Stable primary model directory should be a real directory, not a link."
    }
    if (-not $primary.hasWeights) {
      $issues += "Stable primary model directory does not contain weights.bin."
    }
    if (@($primary.versions).Count -eq 0) {
      $issues += "Stable primary model directory does not contain a version folder."
    }
  }

  foreach ($channel in @($State.channels | Where-Object { $_.role -eq "linked" })) {
    if (-not $channel.rootExists) {
      $warnings += "$($channel.name) user-data root is not present; skipped as not installed."
      continue
    }
    if (-not $channel.modelExists) {
      $issues += "$($channel.name) model directory is missing and should link to Stable."
      continue
    }
    if ($channel.linkType -notin @("SymbolicLink", "Junction")) {
      $issues += "$($channel.name) model directory is a real directory and should be a filesystem link."
      continue
    }
    if (-not $channel.targetMatchesPrimary) {
      $issues += "$($channel.name) model directory points to a different target."
    }
  }

  return [pscustomobject]@{
    ok = ($issues.Count -eq 0)
    issues = $issues
    warnings = $warnings
  }
}

function Get-ChromeProcesses {
  try {
    return @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction Stop |
      Select-Object ProcessId, ExecutablePath, CommandLine)
  } catch {
    return @(Get-Process chrome -ErrorAction SilentlyContinue |
      Select-Object @{ Name = "ProcessId"; Expression = { $_.Id } }, Path, @{ Name = "CommandLine"; Expression = { "" } })
  }
}

function New-BackupPath {
  param(
    [string]$ChannelRoot,
    [string]$BaseName
  )
  $delRoot = Join-Path $ChannelRoot ".del"
  if (-not (Test-Path -LiteralPath $delRoot)) {
    New-Item -ItemType Directory -Path $delRoot -Force | Out-Null
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $candidate = Join-Path $delRoot "$BaseName-$stamp"
  $suffix = 1
  while (Test-Path -LiteralPath $candidate) {
    $candidate = Join-Path $delRoot "$BaseName-$stamp-$suffix"
    $suffix += 1
  }
  return $candidate
}

function Move-ModelPathToBackup {
  param($ChannelState)
  $channelRoot = [System.IO.Directory]::GetParent($ChannelState.path).FullName
  $backupPath = New-BackupPath -ChannelRoot $channelRoot -BaseName $ModelDirectoryName
  Move-Item -LiteralPath $ChannelState.path -Destination $backupPath
  return $backupPath
}

function New-ModelStoreLink {
  param(
    [string]$LinkPath,
    [string]$TargetPath
  )
  try {
    New-Item -ItemType SymbolicLink -Path $LinkPath -Target $TargetPath -Force | Out-Null
    return "SymbolicLink"
  } catch {
    $symbolicLinkError = $_.Exception.Message
    try {
      New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath -Force | Out-Null
      return "Junction"
    } catch {
      throw "Unable to create SymbolicLink or Junction. SymbolicLink error: $symbolicLinkError. Junction error: $($_.Exception.Message)"
    }
  }
}

function New-DoctorResult {
  $state = Get-ChromeAiModelStoreState
  $health = Test-ChromeAiModelStoreState -State $state
  $primary = $state.channels | Where-Object { $_.role -eq "primary" } | Select-Object -First 1
  $linked = @($state.channels | Where-Object { $_.role -eq "linked" -and $_.rootExists -and $_.targetMatchesPrimary } | Select-Object -ExpandProperty name)
  $skipped = @($state.channels | Where-Object { $_.role -eq "linked" -and -not $_.rootExists } | Select-Object -ExpandProperty name)

  $summary = if ($health.ok) {
    "Chrome AI model store is healthy: Stable has $(@($primary.versions).Count) version folder(s); linked channels: $($linked -join ', '); skipped channels: $($skipped -join ', ')."
  } else {
    "Chrome AI model store needs reset: $($health.issues -join '; ')"
  }

  return [pscustomobject]@{
    ok = $health.ok
    summary = $summary
    primaryPath = $state.primaryPath
    issues = $health.issues
    warnings = $health.warnings
    channels = $state.channels
  }
}

function Invoke-Reset {
  $state = Get-ChromeAiModelStoreState
  $health = Test-ChromeAiModelStoreState -State $state
  $primary = $state.channels | Where-Object { $_.role -eq "primary" } | Select-Object -First 1

  if (-not $primary.rootExists -or -not $primary.modelExists -or $primary.linkType -or -not $primary.hasWeights) {
    return [pscustomobject]@{
      ok = $false
      summary = "Cannot reset linked Chrome channels until the Stable primary model directory is a healthy real directory."
      issues = $health.issues
      warnings = $health.warnings
      changes = @()
      channels = $state.channels
    }
  }

  $pending = @()
  foreach ($channel in @($state.channels | Where-Object { $_.role -eq "linked" })) {
    if (-not $channel.rootExists) {
      if (-not $IncludeMissingChannels) {
        continue
      }
      if (-not $PlanOnly) {
        New-Item -ItemType Directory -Path ([System.IO.Directory]::GetParent($channel.path).FullName) -Force | Out-Null
      }
    }
    if (-not $channel.modelExists -or $channel.linkType -notin @("SymbolicLink", "Junction") -or -not $channel.targetMatchesPrimary) {
      $pending += $channel
    }
  }

  if ($pending.Count -gt 0) {
    $chromeProcesses = Get-ChromeProcesses
    if ($chromeProcesses.Count -gt 0) {
      return [pscustomobject]@{
        ok = $false
        summary = "Reset requires closing Chrome first because $($pending.Count) channel model path(s) need filesystem changes."
        issues = @("Chrome is currently running; close all Chrome channels and rerun reset.")
        warnings = $health.warnings
        changes = @()
        runningChromeProcessCount = $chromeProcesses.Count
        channels = $state.channels
      }
    }
  }

  $changes = @()
  foreach ($channel in $pending) {
    if ($PlanOnly) {
      $changes += [pscustomobject]@{
        channel = $channel.name
        action = "would-link"
        backupPath = ""
        linkType = ""
      }
      continue
    }

    $backupPath = ""
    if ($channel.modelExists) {
      $backupPath = Move-ModelPathToBackup -ChannelState $channel
    }
    $linkType = New-ModelStoreLink -LinkPath $channel.path -TargetPath $state.primaryPath
    $changes += [pscustomobject]@{
      channel = $channel.name
      action = "linked"
      backupPath = $backupPath
      linkType = $linkType
    }
  }

  $after = Get-ChromeAiModelStoreState
  $afterHealth = Test-ChromeAiModelStoreState -State $after
  $summary = if ($afterHealth.ok) {
    if ($changes.Count -eq 0) {
      "Chrome AI model store reset completed: no filesystem changes were needed."
    } else {
      "Chrome AI model store reset completed: repaired $($changes.Count) channel link(s)."
    }
  } else {
    "Chrome AI model store reset finished but doctor still reports drift: $($afterHealth.issues -join '; ')"
  }

  return [pscustomobject]@{
    ok = $afterHealth.ok
    summary = $summary
    issues = $afterHealth.issues
    warnings = $afterHealth.warnings
    changes = $changes
    channels = $after.channels
  }
}

try {
  $result = if ($Mode -eq "Reset") {
    Invoke-Reset
  } else {
    New-DoctorResult
  }

  $result | ConvertTo-Json -Depth 8 -Compress
  if (-not $result.ok) {
    exit 1
  }
} catch {
  [pscustomobject]@{
    ok = $false
    summary = $_.Exception.Message
    mode = $Mode
  } | ConvertTo-Json -Compress
  exit 1
}
