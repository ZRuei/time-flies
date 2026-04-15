# Canvas 管理設計（v2，依 API probe 結果修訂）

## 修訂背景

原 v1 設計（同檔上一版）規劃「保留同一份 canvas，用 `canvases.sections.lookup` + `canvases.edit(replace, section_id)` 做原地重寫」。2026-04-15 以 `scripts/probe-canvas-api.js` 實測後確認此路**不可行**：

- `canvases.sections.lookup` 無法列出全部 section：空 criteria / `section_types:['any']` 皆回 `invalid_arguments`；`contains_text` 只能按已知字串查詢
- H1 標題「我愛工作」位於 `title_blocks`，**不是**可查詢的 content section（`contains_text:'我愛工作'` 回空陣列）
- 因此無法系統化清空 canvas 既有內容

同一次 probe 證實另一條路可行：
- `canvases.delete` 用現有 `canvases:write` scope 可刪
- `conversations.canvases.create` 不論 DM 是否已有 canvas 都能建（**會累積**，故必須「先刪再建」）
- `files.info(canvasId)` 在 `files:read` scope 下回傳正確 permalink

本設計改採「每次重寫 = 刪舊建新」策略。

## 目標

1. `/summary`：canvas 永遠等於 store 當前快照（冪等，無重複資料）
2. `/resetcanvas`：完整重置——刪 canvas、清 canvasId、刪 store 全部工時紀錄
3. DM 訊息裡的「開啟畫板」連結**永遠可點開**
4. 不在 Slack UI 累積孤兒 canvas

## 不在範圍內

- 保留穩定 permalink（方案 A 下每次 `/summary` canvas id 會變，使用者應點 DM 訊息的連結，不是自行 bookmark）
- Scheduler 寫入 canvas（本次改為純提醒）
- 按日期區間 upsert（無 API 支援）

## 設計

### `rewriteCanvas(client, userId, dmChannelId, markdown)` — canvas.js

以「刪舊建新」替代原本的 `appendToCanvas`：

```
existingId = store.getCanvasId(userId)
if (existingId) canvases.delete({ canvas_id: existingId })  // 失敗不中斷
newId = conversations.canvases.create({
  channel_id: dmChannelId,
  document_content: { markdown: `# 我愛工作\n\n${markdown}` }
}).canvas_id
store.setCanvasId(userId, newId)
return newId
```

- 刪除失敗（canvas 不存在 / 已被手動刪）不視為致命，繼續 create
- 新 canvas 固定以 `# 我愛工作\n\n` 開頭
- `markdown` 為空字串時，canvas 只有標題——`/resetcanvas` 不使用此函數（見下）

### `/summary` — summary.js

改為全量重寫：

```
allEntries = store.getAllEntries(userId)
if (empty) → 回覆「尚無任何工時紀錄」
markdown = formatEntries(allEntries)
newCanvasId = rewriteCanvas(client, userId, dmChannelId, markdown)
permalink = getCanvasPermalink(client, newCanvasId)
chat.postMessage(「已同步至 Canvas ✓ <permalink|開啟畫板>」)
```

- 參數 `command.text` 的日期區間（this-week / last-week / YYYY-MM-DD ...）僅用於**顯示訊息標籤**，不再篩選 canvas 內容。Canvas 永遠是完整紀錄。
- 執行兩次 `/summary` 結果一致（冪等——canvas 內容相同，但 `canvas_id` 會換）

### `/resetcanvas` — app.js

簡化為純清除（**不**呼叫 rewriteCanvas，避免重建空 canvas）：

```
canvasId = store.getCanvasId(userId)
if (canvasId) canvases.delete({ canvas_id: canvasId })  // 失敗吞掉
store.setCanvasId(userId, null)
store.deleteAllEntries(userId)
chat.postMessage(「Canvas 與工時紀錄已全部清除。下次 /log 後執行 /summary 會重建。」)
```

- 重置後使用者 `/summary` 會因「尚無紀錄」而不建新 canvas
- 若使用者隨後 `/log` 再 `/summary`，才會建立全新 canvas

### `getCanvasPermalink(client, canvasId)` — canvas.js

簡化為單一 API call：

```
info = files.info({ file: canvasId })
return info.file?.permalink || null
```

- 移除舊的 `auth.test` + 自組 URL 的 fallback——probe 證實 `files.info` 穩定回傳正確 URL
- 失敗回 null，呼叫端不在訊息中附連結

需求 scope：`files:read`（2026-04-15 已加上）

### Scheduler — scheduler.js

改為**純提醒**，不再寫入 canvas：

```
每天 09:00 / 14:00 / 19:00（Asia/Taipei，週一至週五）：
  for 每個有 dmChannelId 的使用者：
    todayEntries = store.getEntries(userId, today, today)
    if (empty) → DM：「你今天還沒有工時紀錄，記得 /log」
    else → DM：「你今天有 N 筆紀錄，執行 /summary 可同步至 Canvas」
```

- 不呼叫 Slack canvas API
- `store.markEntriesWritten` 與 `store.getUnwrittenEntries` 移除（方案 A 下冪等，無需追蹤）
- 既有 entry 上的 `writtenToCanvas` 欄位變成殘留資料。`formatter.formatEntries` 目前只讀 `project` / `content` / `hours` 三個欄位，對 `writtenToCanvas` 天然無感，不需修改 formatter

### store.js 變更

**新增：**
- `getAllEntries(userId)` — 回傳 `{ date: entries[] }` 全部日期
- `deleteAllEntries(userId)` — 清空 `logs[userId].entries`，保留 `_meta`

**移除：**
- `markEntriesWritten(userId, date)`
- `getUnwrittenEntries(userId, date)`

**`_meta` 結構保持不變：**
```
logs[userId]._meta = { canvasId, dmChannelId }
```
`/resetcanvas` 只清 `canvasId`（設為 null），保留 `dmChannelId`（讓 scheduler 仍能傳提醒）。

### 資料流總覽

```
/log         → store.addEntry
/summary     → store.getAllEntries → formatEntries → rewriteCanvas(delete+create) → files.info(permalink) → DM
/resetcanvas → canvases.delete + store.setCanvasId(null) + store.deleteAllEntries
scheduler    → store.getEntries(today) → DM 提醒（不碰 canvas）
```

## 可行性驗證（來自 2026-04-15 probe）

| 假設 | 驗證結果 |
|---|---|
| `canvases.delete` 可用 | ✅ Step 7 成功（`canvases:write`） |
| 刪除後重建 OK | ✅ Step 8 成功 |
| `files.info.permalink` 格式穩定 | ✅ Step 5 回傳 `https://<workspace>/docs/<team_id>/<canvas_id>` |
| DM 可同時存多份 canvas | ✅ Step 6 確認——故必須先刪再建，不能省略 delete |
| `sections.lookup` 能列全部 section | ❌ 三種 criteria 皆失敗，方案 B 作廢 |

## 錯誤處理原則

- `canvases.delete`：任何錯誤都吞掉（canvas 可能已不存在、已被手動刪、id 失效）
- `conversations.canvases.create`：失敗時向使用者回報「建立 canvas 失敗」訊息，不清 store
- `files.info`：失敗時 `permalink = null`，訊息不附連結但不視為整體失敗
- 呼叫順序：**先刪再建**，若 create 失敗，舊 canvas 已刪除，store 的 canvasId 保持舊值——下次 `/summary` 會再嘗試 delete（吞錯）+ create，狀態自我修復

## 限制（明確記錄）

1. **permalink 每次 `/summary` 都變**——訊息裡帶新連結，使用者不能穩定 bookmark
2. **canvases.delete 無法復原**——重置後舊 canvas 永久消失（使用者預期行為，寫在提示文字）
3. **race condition**：同一使用者短時間內連續 `/summary` 可能造成 canvas 建了被刪——可接受，因為最終結果一致（store 為真源）
4. **孤兒 canvas 殘餘**：歷史資料 `logs.json` 裡的 `canvasId` 可能指向已被手動刪除的 canvas——`rewriteCanvas` 的「刪除失敗吞錯」設計能處理此情況
