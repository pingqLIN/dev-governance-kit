function Resolve-DevGovProjectsRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceRoot
  )

  $resolvedWorkspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
  $workspaceParent = Split-Path -Parent $resolvedWorkspace
  $workspaceParentName = Split-Path -Leaf $workspaceParent

  if ($workspaceParentName -match '(?i)(?:\.worktrees|-worktrees)$') {
    return Split-Path -Parent $workspaceParent
  }

  return $workspaceParent
}
