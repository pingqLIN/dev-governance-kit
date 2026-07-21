[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory, Position=0)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')][string]$Name,
  [string]$WorkspaceRoot = 'Q:\Projects',
  [string]$TemplateRoot,
  [switch]$SkipGit
)

$ErrorActionPreference = 'Stop'
$TemplateRoot = if ($TemplateRoot) { $TemplateRoot } else { Join-Path $PSScriptRoot '..\templates\project-bootstrap' }
$projectPath = [IO.Path]::GetFullPath((Join-Path $WorkspaceRoot $Name))
$templatePath = [IO.Path]::GetFullPath($TemplateRoot)
if (-not (Test-Path -LiteralPath $templatePath -PathType Container)) { throw "Template root not found: $templatePath" }
if (Test-Path -LiteralPath $projectPath) { throw "Refusing to bootstrap an existing path: $projectPath" }
if (-not (Test-Path -LiteralPath $WorkspaceRoot -PathType Container)) { throw "Workspace root not found: $WorkspaceRoot" }

$stamp = (Get-Date).ToUniversalTime().ToString('o')
$projectId = $Name.ToLowerInvariant() -replace '[^a-z0-9]+','-' -replace '(^-|-$)',''
$files = @('AGENTS.md', '.gitignore', 'handoff.json', 'project.json')
if ($PSCmdlet.ShouldProcess($projectPath, 'Create governed project scaffold')) {
  New-Item -ItemType Directory -Path $projectPath -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $projectPath '.governance') -Force | Out-Null
  foreach ($file in $files) {
    $target = if ($file -in @('handoff.json','project.json')) { Join-Path $projectPath ".governance\$file" } else { Join-Path $projectPath $file }
    (Get-Content -LiteralPath (Join-Path $templatePath $file) -Raw).Replace('{{PROJECT_NAME}}',$Name).Replace('{{PROJECT_ID}}',$projectId).Replace('{{GENERATED_AT}}',$stamp) | Set-Content -LiteralPath $target -Encoding utf8
  }
  $snapshot = [ordered]@{
    '$schema' = 'devgov.environment-snapshot.v1'; project = $Name; capturedAt = $stamp
    os = [ordered]@{ platform = [Environment]::OSVersion.Platform.ToString(); version = [Environment]::OSVersion.Version.ToString() }
    node = [ordered]@{ present = [bool](Get-Command node -ErrorAction SilentlyContinue); version = if (Get-Command node -ErrorAction SilentlyContinue) { (node --version) } else { $null } }
    python = [ordered]@{ present = [bool](Get-Command python -ErrorAction SilentlyContinue); version = if (Get-Command python -ErrorAction SilentlyContinue) { (python --version 2>&1).ToString() } else { $null } }
    gpu = [ordered]@{ state = 'not-probed'; note = 'No GPU command or model store was executed by bootstrap.' }
    models = [ordered]@{ state = 'not-probed'; note = 'Model paths and credentials are intentionally not collected.' }
    toolchain = [ordered]@{ git = if (Get-Command git -ErrorAction SilentlyContinue) { (git --version) } else { $null } }
  }
  $snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $projectPath '.governance\environment-snapshot.json') -Encoding utf8
  if (-not $SkipGit) { git -C $projectPath init | Out-Host }
  $workspaceGovernance = Join-Path $WorkspaceRoot '.governance'
  New-Item -ItemType Directory -Path $workspaceGovernance -Force | Out-Null
  $registryIndex = Join-Path $workspaceGovernance 'project-registry.json'
  $scanner = Join-Path $PSScriptRoot 'scan-project-registry.mjs'
  if (Get-Command node -ErrorAction SilentlyContinue) {
    node $scanner $WorkspaceRoot --out $registryIndex | Out-Host
  } else {
    Write-Warning 'Node was not found; project-registry.json was not refreshed.'
  }
  Write-Output "Created $projectPath"
}
