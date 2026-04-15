## 1. 修復 Canvas 建立 API

- [ ] 1.1 確認 Slack App 的 OAuth scopes 已包含 `canvases:write`（在 Slack API 後台 → OAuth & Permissions 確認）
- [x] 1.2 更新 `src/canvas.js` 的 `getOrCreateCanvas`，將 `conversations.canvases.create` 改為 `canvases.create`
- [x] 1.3 確認 `canvases.create` 回傳欄位名稱（`canvas_id`）與現有程式碼一致，必要時調整欄位取值
- [x] 1.4 更新 `src/commands/summary.js` 的錯誤處理，將錯誤訊息改傳至使用者 DM（`dmChannelId`）而非 command channel

## 2. 修復「再新增一筆」按鈕不消失

- [x] 2.1 在 `src/commands/log.js` 的 `log_add_another` handler 中，呼叫 `openLogModal` 之後加入 `chat.update`，移除原訊息的 actions block
- [x] 2.2 驗證更新後訊息只保留 section 確認文字，與 `log_done` 行為一致

## 3. 測試與驗證

- [ ] 3.1 執行 `/summary`，確認 Canvas 畫板成功建立並在 DM 中顯示連結
- [ ] 3.2 執行 `/log` 新增一筆工時，點擊「再新增一筆」，確認按鈕消失且新 Modal 正常開啟
- [ ] 3.3 執行 `/log` 新增一筆工時，點擊「完成」，確認按鈕消失（回歸測試）
- [ ] 3.4 模擬 `canvases:write` 權限不足情境，確認錯誤訊息正確傳至 DM
