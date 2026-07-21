# Codex 本機狀態治理

在檢查像 `%USERPROFILE%\.codex` 這類本機 Codex home 時，請使用此流程。

Codex home 可以是 Git repository，但只能作為 private local rollback surface。除非每個 tracked file 都完成 secrets 與 machine-specific state 的審查，否則不要把它當成可發布專案、共享 registry，或連到 remote 的 repo。

## 預設分類

| Surface | 分類 | 規則 |
|---|---|---|
| `AGENTS.md` 與 repo-local instructions | 可追蹤 policy | 文字可重用且已審查時，可以 commit。 |
| `config.toml` | 敏感本機設定 | 只適合 local-only repo 追蹤；若要分享，改用 redacted example。 |
| auth、credentials、token、session、history、SQLite files | secret 或 private runtime state | 必須維持 untracked。 |
| plugin caches 與 generated marketplace copies | volatile cache | 除非刻意 vendoring 已審查 fixture，否則必須 untracked。 |
| Codex runtime logs 與 reports | local evidence | 不放進 canonical registry data；只在 docs 或 reports 摘要 findings。 |

## 檢查清單

1. 確認 Git root 與 remote 狀態。

```powershell
git -C $env:USERPROFILE\.codex rev-parse --show-toplevel
git -C $env:USERPROFILE\.codex status --short --branch
git -C $env:USERPROFILE\.codex remote -v
```

只要有 remote，就先進入 promotion gate。tracked files 沒有完成掃描與 redaction 前，不要 push。

2. 改動前先檢查 tracked files。

```powershell
git -C $env:USERPROFILE\.codex ls-files
```

健康的 local rollback repo 通常只應追蹤小型 allowlist，例如 `.gitignore`、`AGENTS.md`，以及可選的已審查 `config.toml` 或 `config.example.toml`。

3. 掃描 tracked config 的敏感欄位。

檢查 token、secret、password、credential、auth、bearer、key、本機 proxy URL、完整本機路徑、hook state、service endpoints。即使不是雲端 credential，local proxy token 與 capability-token path 也視為 private。

4. 另外檢查 startup 與 resident service surface。

Codex-created startup entries、Scheduled Tasks、Cloudflare tunnels、`0.0.0.0` app servers 應該放在 startup 或 local-agent reports，不要把它們當成一般專案檔案處理。

5. 將重複發生的 tool failure 轉成 agent policy。

如果 logs 顯示 `blocked by policy` 這類 tool-router failure，且來源是巢狀 PowerShell 呼叫，應更新本機 agent instructions，讓後續 agents 直接使用 shell tool 執行內層 PowerShell，不要再包一層 `pwsh.exe -Command`。

## 清理指引

需要保留磁碟檔案、但不應繼續被 Git 追蹤時，使用 `git rm --cached`。不要因為某個 runtime file 曾經被 tracked，就直接刪除本機檔案。

建議清理順序：

1. 先備份目前狀態，或確認已有乾淨 checkpoint。
2. 用 `git rm --cached` 解除 cache、generated plugin、volatile skill copies 的追蹤。
3. 決定 `config.toml` 要維持 local-only tracked，或改成 private untracked file，另 commit `config.example.toml`。
4. 維持 `.gitignore` deny-by-default。
5. 重新執行 tracked-file 與 sensitive-field scans。

## 完成條件

Codex home Git repo 可接受的條件：

- 沒有 remote，或 remote 明確是 private 且已審查；
- tracked files 都是刻意允許；
- runtime state、auth material、logs、caches 維持 untracked；
- startup 與 tunnel exposure 另行記錄；
- config changes 可回復，並已通過 TOML parsing 驗證。
