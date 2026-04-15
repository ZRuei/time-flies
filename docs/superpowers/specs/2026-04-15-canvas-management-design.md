# Canvas 管理設計

## 問題描述

Bot 建立的 Slack Canvas 在 Slack UI 中無法刪除（右鍵選單沒有刪除選項）。使用者累積了多份孤立的「我愛工作」畫板，且 append-only 的做法導致多次執行 `/summary` 後出現格式錯誤或過時資料。

## 目標

1. 每位使用者只有一份 canvas，不累積重複檔案
2. `/summary` 永遠反映 store 的當前狀態（格式正確、無過時資料）
3. `/resetcanvas` 提供完整的全新開始：同時清空 canvas 內容與 store 資料
4. 「刪不掉」的問題從設計層面消除——使用者不需要刪除 canvas

## 不在範圍內

- 按日期區間 upsert（Slack Canvas API 限制，實作太複雜）
- 查看或匯出使用者資料的管理工具（另行討論）
- Canvas 分享或多人協作

## 設計

### Canvas 唯一性

每位使用者只有一份 canvas。`canvasId` 持久化儲存於 `data/logs.json`（掛載在 Railway Volume）。`getOrCreateCanvas` 在呼叫 `conversations.canvases.create` 前會先檢查是否已有 ID。同一份 canvas 無限期重複使用。

### `/summary` — 完整重寫

將 append-only 改為每次完整覆寫：

1. 從 store 撈出**該使用者所有工時記錄**
2. 用 `formatEntries` 格式化
3. 呼叫 `canvases.edit`，以 `replace` 操作覆蓋整份 canvas 內容

Canvas 永遠等於 store 的當前快照。執行兩次 `/summary` 結果相同（冪等）。

### `/resetcanvas` — 完整清除

1. **清空 canvas 內容** — 呼叫 `canvases.edit` 將 canvas 主體替換為空內容（保留標題「我愛工作」，`canvasId` 不變）
2. **刪除 store 資料** — 從 `data/logs.json` 移除該使用者所有工時記錄

`canvasId` **不清除**——重置後繼續使用同一份 canvas。使用者從零開始記錄，下次 `/summary` 只會寫入新資料。

**使用者預期體驗：** 執行 `/resetcanvas` 後，canvas 和工時記錄都清空。下次 `/summary` 不會出現以為已刪除的舊資料。

### 資料流

```
/log       → store.addEntry()
/summary   → store.getAllEntries(userId) → formatEntries() → canvases.edit(replace)
/resetcanvas → canvases.edit(清空內容) + store.deleteAllEntries(userId)
```

## 實作重點

- `store.js` 新增 `deleteAllEntries(userId)` 函數
- `canvas.js` 的 `appendToCanvas` 改為 `rewriteCanvas(client, canvasId, markdown)`
- `canvases.edit` 使用 `replace` 操作覆寫根節點內容
- `/resetcanvas` 需在 Slack App 後台註冊為 Slash Command
