# Local Antivirus Governance

Traditional Chinese: [local-antivirus-governance.zh-tw.md](local-antivirus-governance.zh-tw.md)

## Decision

Use `npm run av:triage` as the DevGov entry point when local antivirus or endpoint protection blocks a local build, test run, dev server, browser automation run, generated binary, or subprocess.

This command is dry-run only. It does not disable protection, clear quarantine, restore files, add exclusions, change firewall rules, or modify browser or OS security settings.

## Quick Start

From this repo:

```powershell
npm run av:triage -- -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -RebuildCommand "npm run build" -IncludeDefenderPreview
```

The report is written to `reports/antivirus-triage.md` by default.

Codex and other agent workflows should use the hook wrapper when the trigger is an alert, a failed command, or command output:

```powershell
npm run codex:av-hook -- -Product "Bitdefender" -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -AlertText "Bitdefender blocked generated build output" -RebuildCommand "npm run build"
```

The hook can also wrap a command and inspect its failed output:

```powershell
npm run codex:av-hook -- -Run "npm run build" -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -Product "Bitdefender" -RebuildCommand "npm run build"
```

Command output captured by the hook is written to `reports/antivirus-hook-command.log`.

Use `-NoDefenderEvidence` for fixture tests or machines where Microsoft Defender cmdlets are unavailable:

```powershell
npm run av:triage -- -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -NoDefenderEvidence
```

## What The Command Does

- Collects read-only Microsoft Defender evidence with `Get-MpThreatDetection` and `Get-MpPreference` when available.
- Classifies supplied paths as `candidate`, `hold`, `reject`, or `triage`.
- Proposes only exact generated files or narrow generated folders as allowlist candidates.
- Writes local evidence under `reports/`.
- Emits commented Defender preview commands only when `-IncludeDefenderPreview` is supplied.

## Hook Trigger Conditions

Use `npm run codex:av-hook` when at least one of these is true:

- Defender, Bitdefender, antivirus, endpoint protection, quarantine, blocked, disinfected, threat detected, or malware appears in alert text or failed command output.
- A build, test, Playwright run, dev server, generated executable, native binary, local MCP helper, agent helper, or subprocess fails while a security product reports a block.
- A generated artifact path is supplied and the operator or agent suspects antivirus interference.
- The file appears immediately after a build and then disappears, or a spawn/access-denied failure coincides with a security alert.

Do not use the hook to bypass security triage. High-risk alert text still routes to `triage`, not an allowlist candidate.

## Safe Candidate Rule

A path can become a candidate only when it is narrow and contains a generated or rebuildable segment such as:

```text
dist
build
out
.next
.nuxt
.vite
.turbo
target
obj
bin/Debug
bin/Release
coverage
test-results
playwright-report
.cache
.tmp
tmp
artifacts
generated
```

Supplying `-RebuildCommand` lowers the reported risk because it records how the artifact can be recreated.

## Rejected By Default

The command rejects broad or sensitive scopes, including:

- drive roots
- user profiles
- Desktop, Documents, AppData, and temp roots
- project roots
- `.git`, `src`, `source`, `lib`, and `app`
- entire `node_modules`
- common interpreters and browsers such as `powershell.exe`, `pwsh.exe`, `cmd.exe`, `node.exe`, `python.exe`, and `chrome.exe`

If the alert names credential theft, ransomware, backdoor, persistence, obfuscation, injection, tampering, or suspicious network behavior, the command switches to security triage and does not propose an allowlist.

## Apply Gate

Applying an antivirus exclusion is outside v1. If an operator later asks to apply one, perform a separate safety pass first:

- re-read current antivirus evidence
- verify the exact path still matches the report
- verify the target is generated and rebuildable
- capture current exclusions
- apply only the reviewed narrow target
- document how to remove the exclusion
