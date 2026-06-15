# LM Studio Local Agent 功能深度說明

- 來源：`Q:\Projects\lmstudio_local_agent/agent.py`
- 版本：`agent.py`（本機 snapshot，未含 Python 套件管理）
- 主題：功能、邊界、失效模式與治理建議

## 1. 命令入口與資料流

`agent.py` 以 `argparse` 提供三個子命令：

- `index --root --index`
  - 從 `--root` 遍歷文字副檔名集合（`.txt/.md/.json/...`）；
  - 用 `chunk_text` 做固定長度切塊（預設 `size=1200`, `overlap=150`）；
  - 呼叫 `text-embedding-nomic-embed-text-v1.5` 做 embedding，組合 `{"path","chunk_id","text","embedding"}` 寫入索引 JSON；
- `search --index --query`
  - 讀取索引後以 query embedding 與文件 embedding 做餘弦相似度排序；
  - 回傳前 `top_k` 筆（預設 5）；
- `ask --root --request [--index] [--confirm]`
  - 先透過 `plan_request` 取得 action（list/search/delete/refuse）；
  - `search_docs` 會呼叫 `search_index` 再交由聊天模型回應；
  - `delete_glob` 依 `--confirm` 在 dry-run/execute 間切換。

## 2. 安全邊界（較關鍵）

1. `safe_root` + `ensure_inside`：任何操作都限制在 `--root` 內；
2. 删除是 dry-run 預設：`delete_glob` 若無 `--confirm` 僅回傳命中清單；
3. `plan_request` 僅允許固定 actions：`list_files`、`read_file`、`search_docs`、`delete_glob`、`refuse`；
4. 回覆內容若為可疑指令時 `READ` 行為會導向 `refuse`；
5. 回傳結果可見 `plan` + `result`，有利於人機稽核，但目前尚未寫入獨立 audit log。

## 3. 外部依賴與運作風險

- 完全依賴 LM Studio API（`127.0.0.1:1234`）可用性。
- `--chat-model` 與 `--embed-model` 與實際可用模型同步；若模型未載入，`ask`/`index` 會失敗。
- 未包含重試/排程機制；不屬於長駐服務，偏向手動啟動工具鏈。
- 未將刪除操作預設禁用在 `list_files`/`read_file` 分支，但 `delete` 需明確確認旗標。

## 4. 與 DevGov 對齊建議

1. 當 `lmstudio_local_agent` 在開發機器上穩定使用後，可將 `local-agents` 狀態從 `candidate` 提升為 `approved`；
2. 建議在 `report` 或目標運行手冊中固定要先載入的 `chat/embedding` model；
3. 如要做長期運行，補齊 `audit`/`doctor` 目標指標，避免僅靠 CLI 成功即視為健康；
4. 目前的起動控制以 `service-control` on-demand 為主，無常駐背景程式，治理上以「可重現啟動」為重點。
