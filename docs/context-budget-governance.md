# Context Budget Governance

DevGov treats context budget as a governed runtime surface. The goal is to reduce always-loaded prompt, tool, skill, memory, and project context while preserving safety, correctness, and explicit user intent.

## Model

Use DevGov as the canonical governance record and UniText as the local routing consumer:

- DevGov records stable context-budget rules in `registry/agent-instructions.registry.json`.
- DevGov writes local measurement evidence to `reports/`.
- UniText-style adapters consume compact indexes instead of full skill bodies or long project histories.
- Live Global AGENTS changes remain review-gated and require an explicit operator request.

## Budget Levels

| Level | Name | Use For | Loading Rule |
| --- | --- | --- | --- |
| L0 | no-tool | Natural-language answers, rewriting, translation, brainstorming, static reasoning | Do not load files, tools, connectors, or skill bodies. |
| L1 | light-retrieval | File names, metadata, registry summaries, short snippets | Retrieve the smallest local evidence needed. |
| L2 | targeted-retrieval | Specific file questions, limited comparisons, exact evidence chunks | Search first, then read only matching sections. |
| L3 | artifact | PDF, DOCX, slides, spreadsheets, images, or connector-backed artifacts | Load only the matching skill or connector instructions. |
| L4 | complex | Multi-file synthesis, large transformations, data-heavy analysis | Allow broader context, but summarize intermediate findings. |

## Routing Rules

Default to `L0-no-tool`. Escalate only when the request cannot be completed from the current task text and already-loaded safe context.

Keep the always-loaded surface to:

- authority order and conflict handling
- safety, credentials, Git, deletion, and publication gates
- a compact tool and skill routing map
- active user constraints and unresolved task state

Keep these lazy-loaded:

- full skill bodies
- connector-specific instructions
- platform tool details
- full documents and old conversation history
- project histories and private planning notes

## Audit Command

Run:

```powershell
npm run scan:context-budget
```

The command writes:

- `reports/context-budget-audit.md`
- `reports/context-budget-audit.json`

The report estimates observable local sources only. Platform system prompts, developer instructions, native tool schemas, and connector schemas are runtime-owned and not fully measurable from repository files.

## Promotion Rules

Promote only stable routing rules into `registry/`. Do not store full local paths, raw conversation archives, complete skill bodies, private planning notes, or secret-bearing config contents in canonical records.

Use reports for local evidence. Use the registry for reviewed policy.
