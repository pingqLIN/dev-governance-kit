# Product

## Register

product

## Users

DevGov is for operators and AI agents who maintain local development environments across several repositories. The primary users need to inspect governance state quickly, confirm that service ports and startup surfaces are registered, and run evidence-producing checks without mutating target projects by accident.

Secondary users include project maintainers who need stable templates, registry contracts, and local dashboard views that can be reused before starting services or publishing route changes.

## Product Purpose

DevGov keeps local development governance auditable. It centralizes canonical records for ports, startup entries, Terminal profile assets, public routes, local service agents, development API key locations, Git worktrees, and AGENTS instruction scope. It pairs those records with scanners, validators, generated reports, and a loopback dashboard on `127.0.0.1:3101`.

Success means a user can answer three questions without guesswork: what is registered, what evidence was generated locally, and what remains review-gated before any mutation. Canonical shared data belongs in `registry/`; generated evidence belongs in `reports/`; reusable project-facing assets belong in `templates/`.

## Brand Personality

DevGov should feel precise, sober, and operationally calm. It is a workshop instrument, not a marketing surface. The interface may be memorable, but trust comes first: dense information should remain readable, controls should feel familiar, and every status label should make the safety boundary obvious.

The tone is direct and field-ready. It favors exact names, explicit review states, stable IDs, and concrete next checks over promotional language.

## Anti-References

- Do not look like a generic SaaS landing page.
- Do not use decorative glassmorphism, purple-blue gradients, or celebratory dashboard theatrics.
- Do not hide safety gates behind vague success language.
- Do not make registry evidence feel editable unless an apply path is explicitly reviewed.
- Do not imply public exposure, restart control, credential access, or cleanup is safe without the corresponding registry policy.

## Strategic Design Principles

- Audit-first: default surfaces should read as inspection and evidence, not action.
- Registry-centered: canonical records, generated reports, and reusable templates must remain visually and conceptually distinct.
- Local and reversible: loopback services, generated artifacts, and manual review gates should be visible in the interface.
- Dense but legible: tables may carry many fields, but typography, spacing, contrast, and wrapping must support repeated scanning.
- Safety vocabulary is product vocabulary: terms such as `approved`, `review_required`, `blocked`, `local`, and `public` must be visually consistent and high contrast.
- Agent-readable and human-readable: UI copy and documentation should help both a human operator and a future agent understand the same boundary.
