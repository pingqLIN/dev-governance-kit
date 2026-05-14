# Onboarding Existing Projects

Use this workflow when bringing an existing project under port governance.

This mirrors the UniText-style data flow:

- `registry/` is canonical shared policy.
- `templates/` is the reusable consumer/read-model layer.
- `reports/` is generated evidence and should not be treated as policy.
- target project edits are manual in v1.

## Phase 1: Audit Only

Run a read-only scan:

```powershell
node scripts/scan-project.mjs Q:\Projects\example --out reports\example-port-audit.md
```

Review:

- discovered ports
- source files and line numbers
- hard-coded ports
- host bindings
- automatic fallback behavior
- Docker `ports` that could be `expose`

## Phase 2: Register

Add approved services to `registry/ports.registry.json`.

Each entry must include:

- `project`
- `service`
- `port`
- `host`
- `visibility`
- `protocol`
- `source`
- `notes`

Use a stable project name instead of a local path. If an allocation is temporary, record that in `notes` and keep machine-specific proof in a generated report.

## Phase 3: Project Governance Files

Add or update the target project files:

- `PORTS.md`
- `.env.example`
- dev startup scripts
- repo-local `AGENTS.md` or included port-governance section

## Phase 4: Verify

Run:

```powershell
npm test
npm run validate:registry
node scripts/scan-project.mjs <target-project>
```

Use `templates/check-ports.mjs` only for TCP port availability checks. UDP registry entries need a protocol-specific verification command.

Do not batch-apply changes across a workspace until one project has passed review.

## Version 1 Boundary

There is no `apply-project` command in v1. The scanner produces evidence, the registry records approved policy, and humans or review-gated agents update target projects one at a time.
