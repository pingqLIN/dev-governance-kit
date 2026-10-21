# UFFS Search Governance — Phases 1–4 Local Canary Acceptance

Date: 2026-10-21. Branch: feat/uffs-search-governance-20261021.
Status: LOCAL SINGLE-SESSION CANARY PASS. GLOBAL PROMOTION: NOT APPROVED.

## Phase 1: Local Files MCP alias scope
Implementation: scripts/lib/local-files-scoped-search.mjs.
The trusted host loads its own alias roots through an injected trusted config reader, and pins exactly one subtree via UFFS_CANARY_SCOPE at launch. Tool callers cannot set these inputs. The adapter checks alias/subpath syntax, realpath containment, directory type and excluded components, then translates results back to alias paths. Connected Local Files MCP successfully listed the same test subtree.

Boundary: The standalone canary reads Local Files MCP loadConfig() from an installed local compiled module, selected by an operator-only environment variable. This is a *local configuration parity check*, NOT authenticated re-use of a Cloudflare Access principal or a live Local Files authorization decision. An authenticated server-side scope grant is still missing for remote use.

## Phase 2: UFFS path restrictions
Official MCP documents path_contains; the CLI filters manual specifies that --in-path is applied after full-path resolution (post-filter). Actual UFFS v0.6.44 local CLI probe using notepad.exe on indexed C: produced 7 unfiltered rows, and 2 with a System32 path filter; both filtered results were within System32. This proves output filtering, not pre-query ACL, canonical ancestor protection, or metadata non-disclosure.

For this reason, scoped project searches use the bounded native reader, not unscoped UFFS then post-filter. The canary forcibly disables full-drive UFFS even if a host options object enables it. Full-drive UFFS remains a separate, explicit trusted-local-only mode in the underlying router.

Official references:
https://github.com/skyllc-ai/UltraFastFileSearch/blob/main/docs/user-manual/mcp.md
https://github.com/skyllc-ai/UltraFastFileSearch/blob/main/docs/user-manual/filters.md

## Phase 3: One-Agent stdio MCP
Implementation: scripts/uffs-local-mcp-stdio.mjs; acceptance client: scripts/test-uffs-stdio-canary.mjs.
One read-only search_file_names tool with relativeFolder/pattern/limit. No remote transport, file-content operation, file writes, or persistently registered Agent setting. The test client completed MCP initialize and tools/list, 15 allowed tools/call requests and one denied traversal request. No global Codex, ChatGPT or VS Code settings were edited.

Host-only environment inputs:
- UFFS_LOCAL_FILES_CONFIG_MODULE: absolute path to the trusted compiled Local Files config module.
- UFFS_CANARY_SCOPE: pinned alias subtree, e.g. windows-projects:.worktrees/devgov-uffs-search-20261021/scripts/lib.
No path from these variables is sent to the calling Agent. The server is stdio only. Re-running requires compatible Node dependencies.

## Phase 4: Actual acceptance evidence

| Criterion | Result |
| --- | --- |
| SDK MCP initialize/tools/list | PASS, exactly 1 tool |
| Positive calls | PASS, 15/15 |
| Traversal from pinned subtree | DENIED |
| Host path leakage in observed response | Not observed |
| p50 (15 sequential stdio + scoped native searches) | 4.11 ms |
| p95 (same sample) | 16.23 ms |
| Unit tests after changes | 16/16 passed, including real junction escape test |
| UFFS index status | C,E,F loaded; D not loaded; no false not-found |
| Authenticated Cloudflare principal propagation | NOT IMPLEMENTED |
| UFFS pre-query path authorization | NOT PROVEN |
| Persistent Agent registration | NOT DONE |
| Registry or Global AGENTS effective policy update | NOT DONE |

The timings are for a small scoped native walk through stdio, not for full-drive UFFS, and do not provide a production SLA. Repeat on larger controlled fixtures and measure p95/p99 and false negatives for production.

## Verification
In the feature worktree, run:
- node --test tests/uffs-local-files-scope.test.mjs tests/uffs-search-router.test.mjs
- npm run validate:registry
- npm run scan:agents
- npm test
- With trusted host env configured, node scripts/test-uffs-stdio-canary.mjs

Rollback: stop the client-owned stdio process or discard the branch. No HTTP listener, service install, broker, scheduled task or Global AGENTS mutation was performed.

## Promotion decision
NO-GO for Global AGENTS as a mandated UFFS search provider or for remote Agent access. Requires authenticated server-side alias scope grants, identity binding, verified pre-query path authorization or a reviewed equivalent isolation method, TOCTOU/junction hardening and large-fixture load testing.
GO for one trusted local Agent canary with its pinned scope and private stdio channel.
