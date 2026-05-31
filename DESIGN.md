---
name: DevGov
description: Audit-first local development governance console and toolkit.
colors:
  ink-light: "oklch(23% 0.018 248)"
  muted-light: "oklch(47% 0.035 248)"
  line-light: "oklch(82% 0.027 240)"
  paper-light: "oklch(96% 0.01 86)"
  panel-light: "oklch(99% 0.007 86)"
  panel-raised-light: "oklch(94% 0.015 145)"
  input-light: "oklch(99% 0.007 86)"
  accent-light: "oklch(47% 0.106 183)"
  accent-ink-light: "oklch(99% 0.007 86)"
  link-light: "oklch(45% 0.13 261)"
  ok-bg-light: "oklch(90% 0.067 170)"
  warn-bg-light: "oklch(91% 0.08 86)"
  bad-bg-light: "oklch(90% 0.07 27)"
  neutral-bg-light: "oklch(92% 0.021 248)"
  grid-line-light: "oklch(23% 0.018 248 / .045)"
  header-bg-light: "oklch(99% 0.007 86 / .94)"
  focus-light: "oklch(58% 0.13 183)"
  ink-dark: "oklch(92% 0.012 248)"
  muted-dark: "oklch(72% 0.03 248)"
  line-dark: "oklch(37% 0.03 248)"
  paper-dark: "oklch(18% 0.018 248)"
  panel-dark: "oklch(22% 0.02 248)"
  panel-raised-dark: "oklch(28% 0.035 178)"
  input-dark: "oklch(18% 0.018 248)"
  accent-dark: "oklch(70% 0.116 176)"
  accent-ink-dark: "oklch(16% 0.018 248)"
  link-dark: "oklch(76% 0.102 253)"
  ok-bg-dark: "oklch(34% 0.063 170)"
  warn-bg-dark: "oklch(36% 0.064 86)"
  bad-bg-dark: "oklch(35% 0.064 27)"
  neutral-bg-dark: "oklch(30% 0.025 248)"
  grid-line-dark: "oklch(92% 0.012 248 / .045)"
  header-bg-dark: "oklch(20% 0.018 248 / .94)"
  focus-dark: "oklch(77% 0.13 176)"
typography:
  display:
    fontFamily: "Georgia, ui-serif, Times New Roman, serif"
    fontSize: "clamp(34px, 6vw, 72px)"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "0"
  title:
    fontFamily: "Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0"
  mono:
    fontFamily: "Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  none: "0"
  indicator: "999px"
spacing:
  xs: "5px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "18px"
  xxl: "24px"
components:
  button-nav:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.none}"
    padding: "10px 14px"
    height: "44px"
  button-nav-selected:
    backgroundColor: "{colors.ink-light}"
    textColor: "{colors.paper-light}"
    rounded: "{rounded.none}"
    padding: "10px 14px"
    height: "44px"
  button-theme:
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.none}"
    padding: "7px 12px"
    height: "38px"
  input-filter:
    backgroundColor: "{colors.input-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
    height: "42px"
  status-pill:
    backgroundColor: "{colors.neutral-bg-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
---

# Design System: DevGov

## 1. Overview

**Creative North Star: "The Audited Workbench"**

DevGov is a product interface for local development governance. It should feel like a durable instrument on an operator's bench: exact, compact, and calm under pressure. The design serves registry inspection, generated evidence, review gates, and loopback service readiness.

This system rejects generic SaaS spectacle. It does not use decorative glass, purple-blue gradients, celebration metrics, or vague success language. Its memorable traits are practical: a faint grid, hard rules, strong table borders, restrained color, visible status words, and a direct separation between canonical data, generated reports, and review-gated actions.

Use this system for dashboards, registry views, setup guides, report previews, command templates, and internal operator tools. For marketing surfaces, keep the same calm vocabulary, but do not turn the product into a landing-page hero. DevGov earns trust by making local state inspectable.

**Key characteristics:**

- Audit-first, with inspection and evidence before mutation.
- Dense but legible, optimized for repeated scanning.
- Registry-centered, with canonical records visually distinct from generated reports.
- Local and reversible, with loopback URLs, file references, and review gates visible.
- Agent-readable and human-readable, with exact names and stable status language.

## 2. Colors

The DevGov palette is a restrained cool-neutral system with a teal governance accent. Light mode uses warm paper to reduce glare; dark mode uses cool tinted charcoal for long diagnostic sessions. OKLCH is the canonical implementation format in code and this design file.

### Primary

- **Governance Teal** (`accent-light`, `accent-dark`): Use for live indicators, selected readiness accents, and focus affordances. Do not use it as general decoration.
- **Reference Blue** (`link-light`, `link-dark`): Use for links, file references, code-like references, and URLs. Keep underline treatment visible for links.

### Secondary

- **Evidence Green** (`ok-bg-light`, `ok-bg-dark`): Use only for words such as `approved`, `online`, `found`, and `ready`.
- **Review Amber** (`warn-bg-light`, `warn-bg-dark`): Use for `public`, `candidate`, `review_required`, `partial`, and warning states.
- **Blocked Red** (`bad-bg-light`, `bad-bg-dark`): Use for `blocked`, `missing`, `offline`, and true refusal states.
- **Neutral Evidence** (`neutral-bg-light`, `neutral-bg-dark`): Use for `checking`, `disabled`, `not_applicable`, and pending states.

### Neutral

- **Ink** (`ink-light`, `ink-dark`): Primary text, hard borders, selected navigation background.
- **Muted Ink** (`muted-light`, `muted-dark`): Secondary explanatory text and inline metadata.
- **Paper** (`paper-light`, `paper-dark`): Page background.
- **Panel** (`panel-light`, `panel-dark`): Tables, navigation, metric blocks, and guidance blocks.
- **Raised Panel** (`panel-raised-light`, `panel-raised-dark`): Table headers and low-emphasis hover states.
- **Line** (`line-light`, `line-dark`): Row dividers and quiet internal separation.

### Named Rules

**The Status Word Rule.** Never rely on color alone. Every status color must contain the visible status word inside the pill or cell.

**The Restrained Accent Rule.** Accent color is for state, selection, focus, and live readiness. If a surface starts using teal as decoration, remove it.

**The Tinted Neutral Rule.** Do not use pure black or pure white in interface surfaces. Neutral values stay slightly tinted toward the governance palette.

## 3. Typography

**Display Font:** Georgia, ui-serif, Times New Roman, serif

**Body Font:** Aptos, Segoe UI, system-ui, sans-serif
**Label/Mono Font:** Cascadia Mono, Consolas, monospace

**Character:** DevGov typography is native, plain, and exact. The serif display face is reserved for the product title and metric numerals; everything operational uses system UI fonts so tables, controls, and labels feel familiar on Windows.

### Hierarchy

- **Display** (700, `clamp(34px, 6vw, 72px)`, `0.9`): Product title only. Do not use hero-scale type inside panels or tables.
- **Headline** (700, `24px`, `1.2`): Top-level document and page headings outside compact dashboard panels.
- **Title** (700, `20px`, `1.25`): Dashboard view titles, section names, and operator guide subsections.
- **Body** (400, `14px`, `1.45`): Tables, guidance blocks, summaries, and control labels. Keep explanatory prose at 65 to 75 characters when possible.
- **Label** (700, `12px`, `1.35`): Table headers, compact labels, status labels, and field captions. Uppercase is allowed for table headers only.
- **Mono** (400, `13px`, `1.45`): Paths, ports, IDs, commands, URLs when shown as references, and registry field values that must remain exact.

### Named Rules

**The Exact String Rule.** Paths, registry IDs, ports, commands, statuses, and file names must remain exact. Wrap them in monospace and allow long values to wrap or scroll.

**The No Decorative Copy Rule.** Interface copy should state what is registered, what evidence exists, or what remains gated. Avoid promotional adjectives in dashboard controls.

## 4. Elevation

DevGov is flat by default. Depth is conveyed through tonal layering, borders, spacing, sticky positioning, and row rhythm instead of shadows. The only accepted atmospheric effect in the current dashboard is the sticky header backdrop treatment, which keeps text readable while scrolling.

### Shadow Vocabulary

- **None at rest** (`box-shadow: none`): Default for tables, navigation, metric blocks, buttons, inputs, and guidance panels.
- **Sticky header separation** (`border-bottom: 2px solid var(--ink)` plus translucent header background): Use only for persistent top-level chrome.
- **Focus elevation** (`outline: 3px solid var(--focus); outline-offset: 2px`): Use for keyboard focus instead of shadow glow.

### Named Rules

**The Border Is Structure Rule.** Use strong borders for stable operational surfaces. Do not replace them with decorative card shadows.

**The No Nested Cards Rule.** Tables can live inside page content, and guidance blocks can sit above tables, but do not put cards inside cards.

## 5. Components

Components are task-first and familiar. Every component must preserve the audit boundary: inspection surfaces look inspectable, mutation paths look gated, and disabled controls explain why they are disabled.

### Application Shell

- **Header:** Sticky, full-width, with product title, explicit theme toggle, and loopback status URL.
- **Navigation:** Left rail on wide screens, stacked above content on narrow screens. Use full-width buttons with compact numeric glyphs.
- **Main content:** Dense table-first layout with metric strip and evidence panels. Avoid decorative hero sections.

### Buttons

- **Shape:** Rectangular, no rounded corners (`0`).
- **Navigation:** Transparent by default, strong selected state using `ink` background and `paper` text.
- **Theme toggle:** Explicit text button: `Dark mode` or `Light mode`. It stores the manual choice and respects system preference before a choice is saved.
- **Disabled actions:** Mutating actions remain disabled unless the registry contract defines a reviewed apply path, backup or rollback expectation, and permission boundary.
- **Hover / Focus:** Hover uses `panel-raised`; keyboard focus uses the 3px focus outline.

### Tables

- **Purpose:** Canonical registry records, generated evidence indexes, service status, route records, and API key metadata.
- **Structure:** Strong outer border, collapsed row dividers, raised header row, left-aligned cells.
- **Long values:** URLs, paths, IDs, and notes must wrap or be contained by horizontal scrolling on narrow screens.
- **Mobile behavior:** Below `820px`, tables become horizontally scrollable blocks instead of compressing columns into unreadable fragments.

### Status Pills

- **Shape:** Compact rectangular chip with 1px border and visible word.
- **Semantic sets:** `approved` and `ready` use Evidence Green; `review_required` and `partial` use Review Amber; `blocked`, `missing`, and `offline` use Blocked Red; `checking` and `disabled` use Neutral Evidence.
- **Text:** Use exact machine-readable status labels where possible. Do not rewrite `review_required` as "almost done."

### Inputs

- **Use case:** Table filtering, local search, and narrow query controls.
- **Shape:** 2px border, rectangular, `42px` minimum height.
- **Focus:** Use the same visible 3px focus outline as buttons and links.
- **Copy:** Placeholder text should say what is filtered, such as `Filter ports` or `Filter API keys`.

### Links And File References

- **Links:** Underlined, high-contrast Reference Blue, open external URLs in a new tab when rendered in the dashboard.
- **File references:** Use monospace and link to `/file?path=` only for approved repo file paths.
- **Local paths:** Do not store machine-local paths in canonical registry data. If local evidence needs a path, place it in `reports/`.

### Guidance Blocks

- **Purpose:** Explain safety gates, storage boundaries, and generated artifact locations.
- **Structure:** Simple bordered panel with short rows. Use strong labels and exact file references.
- **Tone:** Direct and operational. One paragraph is usually enough.

### Documentation Surfaces

- **README and operator docs:** English publishable default plus `.zh-tw.md` companion.
- **Design docs:** `DESIGN.md` is the machine-readable design system. `DESIGN.zh-tw.md` is the Traditional Chinese human companion. `registry/design-system.registry.json` is the reusable token sidecar.
- **Report previews:** May contain machine-local evidence only when stored under `reports/`.

### Dashboard Scenarios

- **Overview:** Show counts and the governed dashboard socket first.
- **Registry views:** Use filters and tables. Prioritize project, service, socket, status, notes, and evidence.
- **Service readiness:** Show quick test, Doctor state, restart readiness, and explicit disabled or review-required states.
- **Agent instruction governance:** Keep runtime source, canonical registry, generated JSON, generated text index, and UniText endpoint visible together.
- **API key governance:** Show variable names and storage scopes only. Never show credential values or full secret paths.

## 6. Do's and Don'ts

### Do

- Use restrained OKLCH tokens and maintain light/dark parity.
- Keep status words visible and high contrast.
- Prefer tables for registry records and guidance blocks for safety explanations.
- Preserve exact IDs, paths, ports, commands, status labels, and file names.
- Use horizontal table scrolling on narrow screens when the data shape requires it.
- Test desktop light mode, narrow/tablet light mode, and mobile dark mode before accepting UI changes.
- Keep canonical data in `registry/`, reusable assets in `templates/`, generated evidence in `reports/`, and design tokens in `registry/design-system.registry.json`.

### Don't

- Do not use decorative glassmorphism, gradient text, side-stripe card accents, or purple-blue dashboard gradients.
- Do not imply a restart, cleanup, credential, public-route, or apply action is safe without registry policy.
- Do not make generated reports look canonical.
- Do not hide local loopback boundaries or review gates behind vague success copy.
- Do not use pure black or pure white for interface surfaces.
- Do not use nested cards or identical decorative card grids for registry data.
- Do not convert machine-readable status labels into softer marketing language.
