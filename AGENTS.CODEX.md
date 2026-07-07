# AGENTS.CODEX.md

> Codex-specific overlay. This file refines global `AGENTS.md` for Codex execution behavior.

## Progress Reporting

Do not send optional commentary. Spend time on thinking and task execution.
Only report progress when it changes the user's next decision, indicates a
blocking issue, or summarizes completed verification.

## Authority

This file refines global `AGENTS.md` for Codex only. It must not relax global
non-relaxable invariants, including Git safety, privacy, credential handling,
file deletion safety, approval gates, or platform/system/developer/runtime
instructions.
