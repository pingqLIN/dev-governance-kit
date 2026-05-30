# Codex Local State Governance

Use this workflow when reviewing a local Codex home such as `%USERPROFILE%\.codex`.

A Codex home can be a Git repository, but only as a private local rollback surface. It should not be treated as a publishable project, a shared registry, or a remote-backed repository unless every tracked file has been reviewed for secrets and machine-specific state.

## Default Classification

| Surface | Classification | Rule |
|---|---|---|
| `AGENTS.md` and repo-local instructions | trackable policy | May be committed when the text is reusable and reviewed. |
| `config.toml` | sensitive local configuration | Track only in a local-only repo, or replace with a redacted example before sharing. |
| auth, credentials, token, session, history, and SQLite files | secret or private runtime state | Must stay untracked. |
| plugin caches and generated marketplace copies | volatile cache | Must stay untracked unless deliberately vendoring a reviewed fixture. |
| logs and reports from Codex runtime | local evidence | Keep outside canonical registry data; summarize findings in docs or reports. |

## Review Checklist

1. Confirm the Git root and remote state.

```powershell
git -C $env:USERPROFILE\.codex rev-parse --show-toplevel
git -C $env:USERPROFILE\.codex status --short --branch
git -C $env:USERPROFILE\.codex remote -v
```

A remote is a promotion gate. Do not push until tracked files have been scanned and redacted.

2. Inspect tracked files before changing anything.

```powershell
git -C $env:USERPROFILE\.codex ls-files
```

A healthy local rollback repo should usually track only a small allowlist such as `.gitignore`, `AGENTS.md`, and optionally a reviewed `config.toml` or `config.example.toml`.

3. Search tracked config for sensitive fields.

Look for token, secret, password, credential, auth, bearer, key, local proxy URLs, full local paths, hook state, and service endpoints. Treat local proxy tokens and capability-token paths as private even when they are not cloud credentials.

4. Check startup and resident service surfaces separately.

Codex-created startup entries, scheduled tasks, Cloudflare tunnels, and `0.0.0.0` app servers belong in startup or local-agent reports. They should not be normalized as ordinary project files.

5. Convert repeated tool failures into agent policy.

If logs show tool-router failures such as `blocked by policy` from nested PowerShell calls, update local agent instructions so future agents call the shell tool directly instead of wrapping another `pwsh.exe -Command` layer.

## Cleanup Guidance

Use `git rm --cached` for files that should remain on disk but leave the Git index. Do not delete runtime files just because they were tracked by mistake.

Preferred cleanup order:

1. Back up the current state or confirm a clean checkpoint.
2. Remove cache, generated plugin, and volatile skill copies from tracking with `git rm --cached`.
3. Decide whether `config.toml` remains local-only tracked or becomes an untracked private file with a committed `config.example.toml`.
4. Keep `.gitignore` deny-by-default.
5. Re-run the tracked-file and sensitive-field scans.

## Completion Criteria

A Codex home Git repo is acceptable when:

- it has no remote, or any remote is explicitly private and reviewed;
- tracked files are intentionally allowed;
- runtime state, auth material, logs, and caches are untracked;
- startup and tunnel exposure are documented separately;
- config changes are reversible and validated with TOML parsing.
