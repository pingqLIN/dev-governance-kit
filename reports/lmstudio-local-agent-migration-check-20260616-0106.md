# LM Studio Local Agent 專案盤點（遷移與運作現況）

- 盤點時間：2026-06-16
- 專案原始路徑：`C:\lmstudio_local_agent`
- 專案目標路徑：`Q:\Projects\lmstudio_local_agent`
- C 槽映射保留：`C:\lmstudio_local_agent` 指向 `Q:\Projects\lmstudio_local_agent`（junction）

## 1) 路徑與檔案檢核

1. 已將原本目錄移到 `Q:\Projects\lmstudio_local_agent`。
2. `C:\lmstudio_local_agent` 已改為 junction（非實體複製），不含雙份資料。
3. 目標目錄底下保留：
   - `agent.py`
   - `README.md`
   - `API_TEMPLATES.md`
   - `demo_docs/`
   - `data/`

指令檢核：
- `Get-Item C:\lmstudio_local_agent | Select-Object LinkType,Target` 顯示 `LinkType=Junction`，`Target=Q:\Projects\lmstudio_local_agent`。

## 2) 功能盤點（`agent.py`）

`agent.py` 目前提供三個子命令：

- `index`：掃描 `--root` 下文字檔後使用 embedding API 寫入索引 JSON；
- `search`：針對既有索引做向量檢索；
- `ask`：輸入自然語言問題，先做 plan（`list_files` / `search_docs` / `delete_glob` / `refuse`）再執行；

安全邏輯：
- 危險操作（`delete_glob`）預設為 dry-run；僅在 `--confirm` 才會實際刪除；
- `search` / `index` / `ask` 都依賴 LM Studio API；
- 檔案存取以 `--root` 邊界限制與副檔名白名單作基礎。

## 3) 當前運作狀況（2026-06-16）

- `http://127.0.0.1:1234/v1/models` 回傳 `200`，表示 LM Studio local API listener 可達；
- `python agent.py --help` 可正常啟動，CLI 命令解析正常；
- 目前未看到可即時證明模型載入狀態；透過 `ask` 路徑嘗試送出請求時，後端回應 `400`，可解讀為模型尚未就緒或預設模型未載入。  
  （該專案仍可繼續使用，需依環境載入對應 chat/embedding 模型才會正常完成任務流程。）

## 4) 鏈結到本機治理

- 已在 `registry/local-agents.registry.json` 註冊 `lmstudio-local-agent`（project: `lm-studio`，健康檢查點 `http://127.0.0.1:1234/v1/models`）。
- 已加上對應 on-demand 啟動識別 `lm-studio-on-demand`（`registry/startup.registry.json`）。
- 對應變更已在本輪第一個 commit 完成：
  - `71c42df` `chore: register lm-studio local agent governance records`

## 5) 下一步建議

1. 在 LM Studio 中依專案文件設定 chat model 與 embedding model 後，執行 `index -> search -> ask` 的端到端 smoke test，確認全文流程可實作。
2. 視需求決定是否將 `lmstudio-local-agent` 的治理狀態調整為 approved（目前仍 candidate）。
