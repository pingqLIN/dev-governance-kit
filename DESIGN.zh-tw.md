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

DevGov 是本機 development governance 的 product interface。它應該像操作者工作台上的耐用儀器：精確、緊湊，在壓力下仍然冷靜。設計服務於 registry inspection、generated evidence、review gates，以及 loopback service readiness。

這套系統拒絕 generic SaaS spectacle。它不使用裝飾性的 glass、purple-blue gradients、慶祝式 metrics，或模糊的成功語言。它的記憶點來自實用性：淡淡的 grid、硬邊界、強 table borders、克制色彩、可見的 status words，以及 canonical data、generated reports、review-gated actions 之間的清楚分離。

這套系統適用於 dashboards、registry views、setup guides、report previews、command templates，以及內部 operator tools。若用於 marketing surface，也要保留沉穩語彙，不要把產品變成 landing-page hero。DevGov 透過讓 local state 可檢查來取得信任。

**Key characteristics:**

- Audit-first：inspection 與 evidence 優先於 mutation。
- Dense but legible：支援反覆掃讀。
- Registry-centered：canonical records 與 generated reports 視覺上必須區分。
- Local and reversible：loopback URLs、file references、review gates 必須可見。
- Agent-readable and human-readable：精確名稱與穩定 status language 同時服務 human operator 與 future agent。

## 2. Colors

DevGov palette 是 restrained cool-neutral system，加上一個 teal governance accent。Light mode 使用溫和 paper 以降低眩光；dark mode 使用 cool tinted charcoal，支援長時間診斷。OKLCH 是程式碼與本設計文件的 canonical implementation format。

### Primary

- **Governance Teal** (`accent-light`, `accent-dark`)：用於 live indicators、selected readiness accents、focus affordances。不要作為一般裝飾色。
- **Reference Blue** (`link-light`, `link-dark`)：用於 links、file references、code-like references、URLs。Links 必須保留可見 underline。

### Secondary

- **Evidence Green** (`ok-bg-light`, `ok-bg-dark`)：只用於 `approved`、`online`、`found`、`ready` 等狀態。
- **Review Amber** (`warn-bg-light`, `warn-bg-dark`)：用於 `public`、`candidate`、`review_required`、`partial` 與 warning states。
- **Blocked Red** (`bad-bg-light`, `bad-bg-dark`)：用於 `blocked`、`missing`、`offline` 與真正的 refusal states。
- **Neutral Evidence** (`neutral-bg-light`, `neutral-bg-dark`)：用於 `checking`、`disabled`、`not_applicable` 與 pending states。

### Neutral

- **Ink** (`ink-light`, `ink-dark`)：主要文字、硬邊框、selected navigation background。
- **Muted Ink** (`muted-light`, `muted-dark`)：次要說明與 inline metadata。
- **Paper** (`paper-light`, `paper-dark`)：頁面背景。
- **Panel** (`panel-light`, `panel-dark`)：tables、navigation、metric blocks、guidance blocks。
- **Raised Panel** (`panel-raised-light`, `panel-raised-dark`)：table headers 與低強度 hover states。
- **Line** (`line-light`, `line-dark`)：row dividers 與安靜的內部分隔。

### Named Rules

**The Status Word Rule.** 不得只靠顏色表示狀態。每個 status color 都必須在 pill 或 cell 內保留可見狀態文字。

**The Restrained Accent Rule.** Accent color 只用於 state、selection、focus 與 live readiness。若某個 surface 開始把 teal 當裝飾，應移除。

**The Tinted Neutral Rule.** Interface surfaces 不使用純黑或純白。Neutral values 必須略微偏向 governance palette。

## 3. Typography

**Display Font:** Georgia, ui-serif, Times New Roman, serif

**Body Font:** Aptos, Segoe UI, system-ui, sans-serif
**Label/Mono Font:** Cascadia Mono, Consolas, monospace

**Character:** DevGov typography 原生、樸素且精確。Serif display face 只保留給 product title 與 metric numerals；所有操作性內容使用 system UI fonts，讓 tables、controls、labels 在 Windows 上保持熟悉。

### Hierarchy

- **Display** (700, `clamp(34px, 6vw, 72px)`, `0.9`)：只用於 product title。不要在 panels 或 tables 中使用 hero-scale type。
- **Headline** (700, `24px`, `1.2`)：compact dashboard panels 之外的 top-level document 與 page headings。
- **Title** (700, `20px`, `1.25`)：dashboard view titles、section names、operator guide subsections。
- **Body** (400, `14px`, `1.45`)：tables、guidance blocks、summaries、control labels。說明性 prose 盡量維持 65 到 75 characters。
- **Label** (700, `12px`, `1.35`)：table headers、compact labels、status labels、field captions。Uppercase 只允許用於 table headers。
- **Mono** (400, `13px`, `1.45`)：paths、ports、IDs、commands、作為 references 顯示的 URLs，以及必須精確保留的 registry field values。

### Named Rules

**The Exact String Rule.** Paths、registry IDs、ports、commands、statuses、file names 必須保持精確。使用 monospace，並允許長值換行或捲動。

**The No Decorative Copy Rule.** Interface copy 應說明已登錄項目、存在的 evidence，或仍受 gate 控制的項目。Dashboard controls 避免宣傳式形容詞。

## 4. Elevation

DevGov 預設是 flat。Depth 透過 tonal layering、borders、spacing、sticky positioning 與 row rhythm 表達，而不是 shadows。目前 dashboard 唯一接受的 atmosphere effect 是 sticky header 的 backdrop treatment，用於捲動時保持文字可讀。

### Shadow Vocabulary

- **None at rest** (`box-shadow: none`)：tables、navigation、metric blocks、buttons、inputs、guidance panels 的預設。
- **Sticky header separation** (`border-bottom: 2px solid var(--ink)` 加 translucent header background)：只用於 persistent top-level chrome。
- **Focus elevation** (`outline: 3px solid var(--focus); outline-offset: 2px`)：keyboard focus 使用 outline，不使用 shadow glow。

### Named Rules

**The Border Is Structure Rule.** 使用強 borders 建立穩定 operational surfaces。不要用裝飾性 card shadows 取代它們。

**The No Nested Cards Rule.** Tables 可以位於 page content 中，guidance blocks 可以在 tables 上方，但不要把 cards 放進 cards。

## 5. Components

Components 必須 task-first 且熟悉。每個 component 都要保留 audit boundary：inspection surfaces 看起來是可檢查的，mutation paths 看起來是受 gate 控制的，disabled controls 要說明原因。

### Application Shell

- **Header:** Sticky、full-width，包含 product title、明確 theme toggle，以及 loopback status URL。
- **Navigation:** 寬螢幕是 left rail，窄螢幕堆疊在內容上方。使用 full-width buttons 與 compact numeric glyphs。
- **Main content:** Dense table-first layout，搭配 metric strip 與 evidence panels。避免 decorative hero sections。

### Buttons

- **Shape:** Rectangular，沒有圓角 (`0`)。
- **Navigation:** 預設 transparent；selected state 使用 `ink` background 與 `paper` text。
- **Theme toggle:** 明確文字按鈕：`Dark mode` 或 `Light mode`。手動選擇會儲存；尚未選擇前尊重 system preference。
- **Disabled actions:** Mutating actions 必須保持 disabled，除非 registry contract 定義 reviewed apply path、backup 或 rollback expectation，以及 permission boundary。
- **Hover / Focus:** Hover 使用 `panel-raised`；keyboard focus 使用 3px focus outline。

### Tables

- **Purpose:** Canonical registry records、generated evidence indexes、service status、route records、API key metadata。
- **Structure:** 強 outer border、collapsed row dividers、raised header row、left-aligned cells。
- **Long values:** URLs、paths、IDs、notes 必須換行，或在窄螢幕下被水平捲動容器容納。
- **Mobile behavior:** `820px` 以下 tables 變成可水平捲動 blocks，不把欄位壓到不可讀。

### Status Pills

- **Shape:** Compact rectangular chip，1px border，保留可見文字。
- **Semantic sets:** `approved` 與 `ready` 使用 Evidence Green；`review_required` 與 `partial` 使用 Review Amber；`blocked`、`missing`、`offline` 使用 Blocked Red；`checking` 與 `disabled` 使用 Neutral Evidence。
- **Text:** 盡可能使用 exact machine-readable status labels。不要把 `review_required` 改寫成「almost done」。

### Inputs

- **Use case:** Table filtering、local search、narrow query controls。
- **Shape:** 2px border、rectangular、最小高度 `42px`。
- **Focus:** 使用與 buttons 和 links 相同的 3px focus outline。
- **Copy:** Placeholder text 應指出 filter 目標，例如 `Filter ports` 或 `Filter API keys`。

### Links And File References

- **Links:** Underlined、高對比 Reference Blue；dashboard 內 external URLs 開新分頁。
- **File references:** 使用 monospace，只有 approved repo file paths 可連到 `/file?path=`。
- **Local paths:** Canonical registry data 不儲存 machine-local paths。若 local evidence 需要 path，放在 `reports/`。

### Guidance Blocks

- **Purpose:** 解釋 safety gates、storage boundaries、generated artifact locations。
- **Structure:** 簡單 bordered panel 搭配短 rows。使用 strong labels 與 exact file references。
- **Tone:** 直接且 operational。一段通常足夠。

### Documentation Surfaces

- **README and operator docs:** English publishable default 加 `.zh-tw.md` companion。
- **Design docs:** `DESIGN.md` 是 machine-readable design system。`DESIGN.zh-tw.md` 是繁體中文 human companion。`registry/design-system.registry.json` 是 reusable token sidecar。
- **Report previews:** 只有放在 `reports/` 時，可以包含 machine-local evidence。

### Dashboard Scenarios

- **Overview:** 先顯示 counts 與 governed dashboard socket。
- **Registry views:** 使用 filters 與 tables。優先呈現 project、service、socket、status、notes、evidence。
- **Service readiness:** 顯示 quick test、Doctor state、restart readiness，以及明確 disabled 或 review-required states。
- **Agent instruction governance:** Runtime source、canonical registry、generated JSON、generated text index、UniText endpoint 必須一起可見。
- **API key governance:** 只顯示 variable names 與 storage scopes。不得顯示 credential values 或完整 secret paths。

## 6. Do's and Don'ts

### Do

- 使用 restrained OKLCH tokens，並維持 light/dark parity。
- 保持 status words 可見且高對比。
- Registry records 優先使用 tables，safety explanations 使用 guidance blocks。
- 保留 exact IDs、paths、ports、commands、status labels、file names。
- 窄螢幕上資料形狀需要時，使用 horizontal table scrolling。
- UI changes 接受前，測試 desktop light mode、narrow/tablet light mode、mobile dark mode。
- Canonical data 放在 `registry/`，reusable assets 放在 `templates/`，generated evidence 放在 `reports/`，design tokens 放在 `registry/design-system.registry.json`。

### Don't

- 不使用 decorative glassmorphism、gradient text、side-stripe card accents，或 purple-blue dashboard gradients。
- 沒有 registry policy 時，不暗示 restart、cleanup、credential、public-route 或 apply action 是安全的。
- 不讓 generated reports 看起來像 canonical data。
- 不用模糊成功 copy 隱藏 local loopback boundaries 或 review gates。
- Interface surfaces 不使用純黑或純白。
- Registry data 不使用 nested cards 或 decorative card grids。
- 不把 machine-readable status labels 改寫成柔化的 marketing language。
