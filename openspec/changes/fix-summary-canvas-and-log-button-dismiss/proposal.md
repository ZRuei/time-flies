## Why

兩個已上線的功能存在 UX 缺陷：`/summary` 指令無法成功建立 Canvas 畫板（呼叫 `conversations.canvases.create` 後沒有畫板產生），以及 `/log` 的「再新增一筆」按鈕在觸發後不會從訊息中消失，導致同一則訊息可被重複點擊。

## What Changes

- **修復 `/summary` 畫板建立失敗**：診斷 `conversations.canvases.create` 失敗原因（權限範圍或 API 可用性），改用 `canvases.create` standalone API（不綁定頻道），並確保錯誤訊息能協助用戶排查權限問題。
- **修復 `/log` 按鈕不消失**：在 `log_add_another` action handler 中，開啟新 Modal 後同時呼叫 `chat.update` 移除原訊息的 actions block，與現有的 `log_done` 行為一致。

## Capabilities

### New Capabilities
- `canvas-creation`: 修正後的 Canvas 建立邏輯，支援 standalone 建立及頻道綁定兩種 fallback 策略

### Modified Capabilities
- `log-entry`: `/log` 指令完成記錄後的訊息按鈕互動行為變更：「再新增一筆」點擊後需移除按鈕

## Impact

- `src/canvas.js`：`getOrCreateCanvas` 函數改用 `canvases.create` API，移除 `conversations.canvases.create` 依賴
- `src/commands/log.js`：`log_add_another` action handler 新增 `chat.update` 呼叫以移除按鈕
- Slack App 權限範圍：需確認 `canvases:write`（而非 `canvases:read`）已正確設定
