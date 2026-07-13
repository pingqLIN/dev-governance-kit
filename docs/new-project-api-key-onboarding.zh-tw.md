# 新專案 API Key Onboarding

新專案需要開發用 API keys 時，使用此流程。

## 標準流程

1. 在新增 project-local credential files 前，先產生 DevGov onboarding plan：

```powershell
npm run plan:new-project-api-keys -- --project-name <project> --service "OpenAI Platform" --out reports\<project>-api-keys.md --json-out reports\<project>-api-keys.json
```

2. 檢查 report 內的已登記 variable names 與 live persistent scopes。Missing scopes 只是 setup evidence，不代表可以揭露或建立 credentials。
3. 在新專案中，依照 `templates/new-project.env.example` 提交空白 `.env.example`。
4. 真實 values 放在 OS User/Machine environment variables，或 untracked `.env.local`。
5. 載入 dotenv 時使用 `override:false`，讓已存在的環境變數優先。
6. 使用 `templates/api-key-env-resolver.mjs` 或等效 helper。Helper 只讀 `process.env`、只回報名稱與是否存在，絕不 log values。

## Runtime 優先順序

使用這個順序：

1. 從 OS User/Machine variables 繼承而來的既有 process environment。
2. 不覆寫既有 values 的 untracked project-local `.env.local`。
3. 空白、可提交的 `.env.example` 只作為文件。

DevGov 可以檢查 persistent environment variable names 與 registry metadata，但 project runtime 不應掃 credential stores，也不得印出 secret values。

## Registry 邊界

`registry/api-keys.registry.json` 只存穩定 credential-location metadata：

- service,
- variable name,
- storage location type,
- access method,
- usage rules,
- provider settings URL,
- review status。

不得存 credential values、credential file contents、本機 secret paths、shell history 或完整 command lines。
