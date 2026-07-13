$ErrorActionPreference = "Stop"

$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ProjectsRoot = Split-Path -Parent $WorkspaceRoot
$TargetRoot = Join-Path $ProjectsRoot "memory-field\Continuous Memory Field"
$PackageJsonPath = Join-Path $TargetRoot "package.json"
$ObservationSchemaPath = Join-Path $TargetRoot "design\observation.schema.json"

$issues = @()

if (-not (Test-Path -LiteralPath $TargetRoot)) {
  $issues += "target-root-missing"
}

$requiredFiles = @(
  "AGENTS.md",
  "README.md",
  "README.zh-tw.md",
  "docs\README.md",
  "docs\core\PROBLEM_DEFINITION.md",
  "docs\core\IMPLEMENTATION_CONTRACT.md",
  "design\observation.schema.json",
  "src\index.ts",
  "data\.gitkeep"
)

foreach ($relativePath in $requiredFiles) {
  $candidate = Join-Path $TargetRoot $relativePath
  if (-not (Test-Path -LiteralPath $candidate)) {
    $issues += "missing:$relativePath"
  }
}

if (Test-Path -LiteralPath $PackageJsonPath) {
  $package = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json
  if ($package.name -ne "continuous-memory-field") {
    $issues += "package-name"
  }
  if (-not [string]$package.scripts.typecheck) {
    $issues += "script:typecheck"
  }
  if (-not [string]$package.scripts.test) {
    $issues += "script:test"
  }
} else {
  $issues += "missing:package.json"
}

if (Test-Path -LiteralPath $ObservationSchemaPath) {
  $schema = Get-Content -LiteralPath $ObservationSchemaPath -Raw | ConvertFrom-Json
  if ($schema.'$id' -ne "https://continuous-memory-field.local/schema/observation.schema.json") {
    $issues += "observation-schema-id"
  }
  if ($schema.title -ne "Continuous Memory Field Observation") {
    $issues += "observation-schema-title"
  }
}

$ok = ($issues.Count -eq 0)
$summary = if ($ok) {
  "Continuous Memory Field quick health passed: package identity, core docs, schema, source entry, and data placeholder are present."
} else {
  "Continuous Memory Field quick health failed: " + ($issues -join ", ")
}

[pscustomobject]@{
  ok = $ok
  summary = $summary
  project = "continuous-memory-field"
  checks = $issues
} | ConvertTo-Json -Compress

if (-not $ok) {
  exit 1
}
