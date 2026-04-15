## Context

time-flies-bot 是一個 Slack 工時記錄 Bot，使用 `@slack/bolt` v3 與 `@slack/web-api` v6。由於 v6 不含 Canvas API，目前透過 `client.apiCall()` 直接呼叫原始 API。

兩個已知 Bug：
1. `/summary` 呼叫 `conversations.canvases.create` 建立與頻道綁定的 Canvas，此 API 在部分 Slack 方案或權限設定下不可用，導致畫板建立失敗，但錯誤只顯示在 command channel 而非 DM，且目前缺乏降級策略。
2. `/log` 的 `log_add_another` handler 僅開啟新 Modal，沒有更新原訊息移除 actions block，按鈕持續顯示並可重複點擊。

## Goals / Non-Goals

**Goals:**
- 改用 `canvases.create`（standalone Canvas）替代 `conversations.canvases.create`，提升相容性
- `log_add_another` 觸發後立即移除訊息中的按鈕，防止重複點擊
- 保持現有功能行為不變（Canvas 內容、DM 傳送邏輯）

**Non-Goals:**
- 不變更 Canvas 的內容格式或 append 邏輯
- 不重構 Modal 欄位設計
- 不處理 Canvas 跨 workspace 分享

## Decisions

### 1. 改用 `canvases.create` 而非 `conversations.canvases.create`

**決定**：使用 `canvases.create` API 建立 standalone Canvas，不再將 Canvas 與頻道綁定。

**理由**：`conversations.canvases.create` 需要頻道層級的 Canvas 權限，且在 Free plan 下行為不一致。`canvases.create` 只需 `canvases:write` scope，更通用。Canvas 連結仍透過 `getCanvasPermalink` 在 DM 中傳送，使用者體驗不變。

**替代方案**：保留 `conversations.canvases.create` 並加強錯誤訊息 → 無法根治問題，排除。

### 2. `log_add_another` 移除按鈕策略

**決定**：在 `log_add_another` handler 中，呼叫 `openLogModal` 後立即用 `chat.update` 更新原訊息，移除 actions block（與 `log_done` 相同做法）。

**理由**：`body.channel.id` 和 `body.message.ts` 在 action payload 中可直接取得，無需額外 API 呼叫。複用現有 `log_done` 的 `chat.update` 模式，改動最小。

**替代方案**：用 `chat.delete` 刪除整則訊息 → 會連確認文字一起刪掉，UX 較差，排除。

## Risks / Trade-offs

- **Canvas API 可用性**：`canvases.create` 仍需 Slack Pro/Business+ 方案。若 workspace 不支援，仍會拋錯 → 維持現有 try/catch，錯誤訊息改傳至 DM（而非 command channel）讓用戶感知更一致。
- **按鈕更新時序**：`chat.update` 若在 Modal 開啟前失敗，不影響 Modal 顯示，至多按鈕殘留 → 可接受，記錄已完成不影響資料正確性。

## Migration Plan

1. 更新 `src/canvas.js`：`getOrCreateCanvas` 改呼叫 `canvases.create`
2. 更新 `src/commands/log.js`：`log_add_another` handler 加入 `chat.update` 呼叫
3. 重新部署 Bot（無資料遷移需求，`store` 中既有 canvasId 仍可繼續使用）
4. Rollback：git revert 兩個檔案即可，無 DB migration

## Open Questions

- 現有 Slack App 的 OAuth scopes 是否已包含 `canvases:write`？（需在 Slack API 後台確認）
- `canvases.create` 回傳的 `canvas_id` 欄位名稱是否與 `conversations.canvases.create` 相同？（需查 API 文件確認）
