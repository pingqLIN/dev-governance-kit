# 本機防毒治理

English source: [local-antivirus-governance.md](local-antivirus-governance.md)

## 決策

本機防毒或 endpoint protection 在 build、test、dev server、browser automation、產生 binary 或 subprocess 執行時阻擋流程，統一使用 `npm run av:triage` 作為 DevGov 入口。

這個指令只做 dry-run。它不會關閉防護、不會清除 quarantine、不會還原檔案、不會加入排除、不會修改 firewall，也不會改 browser 或 OS security settings。

## 快速開始

在本 repo 執行：

```powershell
npm run av:triage -- -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -RebuildCommand "npm run build" -IncludeDefenderPreview
```

報告預設寫到 `reports/antivirus-triage.md`。

Codex 與其他 agent workflows 遇到 alert、failed command 或 command output 觸發時，應使用 hook wrapper：

```powershell
npm run codex:av-hook -- -Product "Bitdefender" -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -AlertText "Bitdefender blocked generated build output" -RebuildCommand "npm run build"
```

Hook 也可以包住一段 command，並檢查失敗輸出：

```powershell
npm run codex:av-hook -- -Run "npm run build" -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -Product "Bitdefender" -RebuildCommand "npm run build"
```

Hook 捕捉到的 command output 會寫到 `reports/antivirus-hook-command.log`。

如果是在測試 fixture，或機器沒有 Microsoft Defender cmdlets，可以加 `-NoDefenderEvidence`：

```powershell
npm run av:triage -- -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -NoDefenderEvidence
```

## 指令行為

- 可用時，用 `Get-MpThreatDetection` 與 `Get-MpPreference` 收集唯讀 Microsoft Defender evidence。
- 將輸入路徑分類成 `candidate`、`hold`、`reject` 或 `triage`。
- 只針對明確 generated file 或窄範圍 generated folder 產生 allowlist candidate。
- 本機 evidence 只寫入 `reports/`。
- 只有加 `-IncludeDefenderPreview` 時才輸出已註解的 Defender preview command。

## Hook 觸發條件

至少符合以下一項時，使用 `npm run codex:av-hook`：

- Alert text 或 failed command output 出現 Defender、Bitdefender、antivirus、endpoint protection、quarantine、blocked、disinfected、threat detected 或 malware。
- Build、test、Playwright run、dev server、generated executable、native binary、local MCP helper、agent helper 或 subprocess 失敗，同時 security product 回報阻擋。
- 已提供 generated artifact path，且 operator 或 agent 懷疑是防毒干擾。
- 檔案 build 後立刻消失，或 spawn / access-denied failure 與 security alert 同時出現。

不要用 hook 繞過 security triage。高風險 alert text 仍會進 `triage`，不會產生 allowlist candidate。

## 安全候選規則

路徑必須夠窄，且包含 generated 或可重建片段，才可能成為 candidate，例如：

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

提供 `-RebuildCommand` 會降低報告中的風險，因為它記錄了 artifact 如何重新產生。

## 預設拒絕

指令會拒絕過寬或敏感範圍，包括：

- drive roots
- user profiles
- Desktop、Documents、AppData、temp roots
- project roots
- `.git`、`src`、`source`、`lib`、`app`
- 整個 `node_modules`
- `powershell.exe`、`pwsh.exe`、`cmd.exe`、`node.exe`、`python.exe`、`chrome.exe` 等常見 interpreter 或 browser

如果 alert text 提到 credential theft、ransomware、backdoor、persistence、obfuscation、injection、tampering 或 suspicious network behavior，指令會切到 security triage，不產生 allowlist candidate。

## 套用閘門

v1 不負責真正套用防毒排除。如果之後 operator 明確要求套用，必須先做獨立安全檢查：

- 重新讀取目前防毒 evidence
- 確認 exact path 仍符合報告
- 確認目標是 generated 且可重建
- 先記錄目前 exclusions
- 只套用已 review 的窄範圍目標
- 記錄如何移除該 exclusion
