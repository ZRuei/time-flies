# Canvas 管理 v2 實作計畫（方案 A：刪+建）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 `/resetcanvas` 沒真的清除 canvas 與資料，以及畫板連結點不開的問題。改採「每次 summary 刪舊建新 canvas」策略，scheduler 改為純提醒不動 canvas。

**Architecture:** `store.js` 新增 `getAllEntries` / `deleteAllEntries`、移除 `markEntriesWritten` / `getUnwrittenEntries`；`canvas.js` 以 `rewriteCanvas(delete+create)` 取代 `appendToCanvas`，`getCanvasPermalink` 簡化為單一 `files.info`；`summary.js` 改用全量資料重寫；`/resetcanvas` 改為刪 canvas + 清 entries + 清 canvasId；`scheduler.js` 改為純 DM 提醒，不呼叫 canvas API。

**Tech Stack:** Node.js 20, @slack/bolt v3, @slack/web-api v6 (apiCall), Jest 29

**Prerequisite:** Bot 已取得 `files:read` scope（2026-04-15 已加上並 reinstall）。

---

## 檔案結構

```
src/
├── store.js              # MODIFY：add getAllEntries, deleteAllEntries；remove markEntriesWritten, getUnwrittenEntries
├── canvas.js             # REWRITE：appendToCanvas → rewriteCanvas；simplify getCanvasPermalink
├── scheduler.js          # MODIFY：純提醒，不呼叫 canvas API
├── app.js                # MODIFY：/resetcanvas handler
└── commands/
    └── summary.js        # MODIFY：用 getAllEntries + rewriteCanvas

tests/
└── store.test.js         # MODIFY：新增 getAllEntries / deleteAllEntries 測試
```

無 `canvas.js` 單元測試——直接呼叫 Slack API，已由 `scripts/probe-canvas-api.js` 驗證過。

---

## Task 1: store.js — 新增 getAllEntries / deleteAllEntries，移除排程追蹤函數

**Files:**
- Modify: `src/store.js`
- Test: `tests/store.test.js`

- [ ] **Step 1: 在 tests/store.test.js 新增測試**

在 `describe('entries', ...)` 區塊內（約第 57 行 `})`之前）新增：

```javascript
test('getAllEntries returns all dates for user', () => {
  store.addEntry('U001', '2026-04-13', { project: 'RC', content: 'A', hours: 1 });
  store.addEntry('U001', '2026-04-15', { project: 'AS', content: 'B', hours: 2 });
  const result = store.getAllEntries('U001');
  expect(Object.keys(result).sort()).toEqual(['2026-04-13', '2026-04-15']);
  expect(result['2026-04-13'][0].content).toBe('A');
});

test('getAllEntries returns empty object when no data', () => {
  expect(store.getAllEntries('U999')).toEqual({});
});

test('deleteAllEntries removes entries but keeps metadata', () => {
  store.addEntry('U001', '2026-04-14', { project: 'RC', content: 'X', hours: 1 });
  store.setCanvasId('U001', 'F123');
  store.setDmChannelId('U001', 'D123');
  store.deleteAllEntries('U001');
  expect(store.getAllEntries('U001')).toEqual({});
  expect(store.getCanvasId('U001')).toBe('F123');
  expect(store.getDmChannelId('U001')).toBe('D123');
});

test('deleteAllEntries is safe for non-existent user', () => {
  expect(() => store.deleteAllEntries('U999')).not.toThrow();
});
```

- [ ] **Step 2: 確認測試失敗**

```bash
npx jest tests/store.test.js
```

Expected: FAIL — `store.getAllEntries is not a function`

- [ ] **Step 3: 修改 src/store.js**

在 `getEntries` 函數之後（約第 52 行之後）新增兩個函數：

```javascript
function getAllEntries(userId) {
  const logs = readLogs();
  return logs[userId]?.entries || {};
}

function deleteAllEntries(userId) {
  const logs = readLogs();
  if (!logs[userId]) return;
  logs[userId].entries = {};
  writeLogs(logs);
}
```

刪除 `markEntriesWritten` 與 `getUnwrittenEntries` 這兩個函數（第 85-99 行）——方案 A 下 canvas 永遠等於 store 全量，不需寫入追蹤。

更新 `module.exports`（檔案末端）為：

```javascript
module.exports = {
  startTimer, getTimer, clearTimer,
  addEntry, getEntries, getAllEntries, deleteAllEntries,
  setCanvasId, getCanvasId,
  setDmChannelId, getDmChannelId,
  getAllUserIds,
};
```

- [ ] **Step 4: 確認測試通過**

```bash
npx jest tests/store.test.js
```

Expected: PASS（所有 store 測試）

- [ ] **Step 5: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat(store): 新增 getAllEntries / deleteAllEntries；移除排程追蹤函數"
```

---

## Task 2: canvas.js — 以 rewriteCanvas(delete+create) 取代 appendToCanvas，簡化 permalink

**Files:**
- Modify: `src/canvas.js`

- [ ] **Step 1: 完整重寫 src/canvas.js**

將檔案全部內容替換為：

```javascript
const store = require('./store');

/**
 * 重寫使用者的「我愛工作」Canvas。
 *
 * 策略：刪舊建新（方案 A）。
 * - 若 store 有舊 canvasId，先嘗試刪除（失敗吞掉，canvas 可能已不存在）
 * - 建立新 canvas，內容為 `# 我愛工作\n\n` + 傳入的 markdown
 * - 將新 canvasId 寫回 store
 *
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 * @param {string} dmChannelId
 * @param {string} markdown  entries 的 markdown（不含標題）
 * @returns {Promise<string>} 新建的 canvasId
 */
async function rewriteCanvas(client, userId, dmChannelId, markdown) {
  const oldId = store.getCanvasId(userId);
  if (oldId) {
    try {
      await client.apiCall('canvases.delete', { canvas_id: oldId });
    } catch (err) {
      console.warn(`[canvas] delete old canvas ${oldId} failed (ignored):`, err.data?.error || err.message);
    }
  }

  const fullContent = `# 我愛工作\n\n${markdown}`;
  const result = await client.apiCall('conversations.canvases.create', {
    channel_id: dmChannelId,
    document_content: { type: 'markdown', markdown: fullContent },
  });

  const newId = result.canvas_id;
  store.setCanvasId(userId, newId);
  return newId;
}

/**
 * 刪除使用者的 canvas（若存在）並清除 canvasId。
 * 用於 /resetcanvas。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 */
async function deleteCanvas(client, userId) {
  const oldId = store.getCanvasId(userId);
  if (oldId) {
    try {
      await client.apiCall('canvases.delete', { canvas_id: oldId });
    } catch (err) {
      console.warn(`[canvas] delete canvas ${oldId} failed (ignored):`, err.data?.error || err.message);
    }
  }
  store.setCanvasId(userId, null);
}

/**
 * 取得 Canvas 的 permalink。
 * 需要 files:read scope。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} canvasId
 * @returns {Promise<string|null>}
 */
async function getCanvasPermalink(client, canvasId) {
  try {
    const info = await client.apiCall('files.info', { file: canvasId });
    return info.file?.permalink || null;
  } catch (err) {
    console.warn(`[canvas] files.info(${canvasId}) failed:`, err.data?.error || err.message);
    return null;
  }
}

module.exports = { rewriteCanvas, deleteCanvas, getCanvasPermalink };
```

注意：
- 完全移除 `getOrCreateCanvas` 與 `appendToCanvas`（不再使用）
- `rewriteCanvas` 簽名為 `(client, userId, dmChannelId, markdown)`——與舊 API 不同，因此 summary.js 與 scheduler.js 的呼叫方也要改
- `deleteCanvas` 為新 export，給 `/resetcanvas` 使用

- [ ] **Step 2: 確認其他檔案的 import 會在後續 task 調整**

此時執行 `node -e "require('./src/canvas.js')"` 會成功，但 `summary.js` 與 `scheduler.js` 會因舊 import 失敗——下一個 task 會修。暫不執行整體啟動驗證。

- [ ] **Step 3: Commit**

```bash
git add src/canvas.js
git commit -m "feat(canvas): rewriteCanvas 改為刪+建；簡化 permalink 為 files.info"
```

---

## Task 3: summary.js — 改為全量重寫 canvas

**Files:**
- Modify: `src/commands/summary.js`

- [ ] **Step 1: 修改 src/commands/summary.js**

將檔案全部內容替換為：

```javascript
const store = require('../store');
const { formatEntries } = require('../formatter');
const { rewriteCanvas, getCanvasPermalink } = require('../canvas');
const { getTodayTaipei } = require('../date-helper');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function parseDateRange(text, today) {
  const input = text.trim();

  if (input === '') return { start: today, end: today };

  if (input === 'this-week') {
    const d = new Date(today);
    const day = d.getDay(); // 0=Sun
    const daysBack = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - daysBack);
    return { start: toISO(monday), end: today };
  }

  if (input === 'last-week') {
    const d = new Date(today);
    const day = d.getDay();
    const daysToLastMonday = day === 0 ? 13 : day + 6;
    const lastMonday = new Date(d);
    lastMonday.setDate(d.getDate() - daysToLastMonday);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return { start: toISO(lastMonday), end: toISO(lastSunday) };
  }

  const parts = input.split(/\s+/);
  if (parts.length === 1 && DATE_RE.test(parts[0])) {
    return { start: parts[0], end: parts[0] };
  }
  if (parts.length === 2 && DATE_RE.test(parts[0]) && DATE_RE.test(parts[1])) {
    return { start: parts[0], end: parts[1] };
  }

  return null;
}

module.exports = function registerSummary(app) {
  app.command('/summary', async ({ command, ack, client }) => {
    await ack();

    const userId = command.user_id;
    const today = getTodayTaipei();
    const range = parseDateRange(command.text || '', today);

    if (!range) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '日期格式錯誤。範例：`/summary`、`/summary 2026-04-14`、`/summary 2026-04-01 2026-04-14`、`/summary this-week`、`/summary last-week`',
      });
      return;
    }

    // 方案 A：canvas 永遠等於全量 store，參數僅用於訊息標籤
    const allEntries = store.getAllEntries(userId);

    if (Object.keys(allEntries).length === 0) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '尚無任何工時紀錄。',
      });
      return;
    }

    const dmResult = await client.conversations.open({ users: userId });
    const dmChannelId = dmResult.channel.id;
    store.setDmChannelId(userId, dmChannelId);

    const label =
      range.start === range.end ? range.start : `${range.start} ～ ${range.end}`;

    try {
      const markdown = formatEntries(allEntries);
      const newCanvasId = await rewriteCanvas(client, userId, dmChannelId, markdown);
      const permalink = await getCanvasPermalink(client, newCanvasId);
      const linkText = permalink ? `\n<${permalink}|開啟畫板>` : '';
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `Canvas 已同步所有工時紀錄 ✓（你查詢的區間：${label}）${linkText}`,
      });
    } catch (err) {
      console.error('[summary] rewriteCanvas failed:', err);
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `寫入 Canvas 失敗：${err.data?.error || err.message}`,
      });
    }
  });
};

module.exports.parseDateRange = parseDateRange;
```

變更重點：
- import：`rewriteCanvas` 取代 `getOrCreateCanvas` / `appendToCanvas`
- `store.getEntries(userId, range.start, range.end)` → `store.getAllEntries(userId)`（canvas 永遠寫全量）
- `rewriteCanvas(client, userId, dmChannelId, markdown)` 取代 `getOrCreateCanvas` + `appendToCanvas` 兩步
- 訊息措辭調整為反映「同步全量」語意
- `command.text` 的區間參數仍會被 parse，但只影響訊息標籤

- [ ] **Step 2: 確認 summary-parse 測試仍通過**

```bash
npx jest tests/summary-parse.test.js
```

Expected: PASS（`parseDateRange` 邏輯未變）

- [ ] **Step 3: Commit**

```bash
git add src/commands/summary.js
git commit -m "feat(summary): 改為全量資料重寫 canvas"
```

---

## Task 4: app.js — /resetcanvas 改為完整清除

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: 修改 src/app.js 的 require 區塊**

將 `src/app.js` 最上方的 require 改為（加入 `deleteCanvas` import）：

```javascript
require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');
const registerLog = require('./commands/log');
const registerSummary = require('./commands/summary');
const { setupScheduler } = require('./scheduler');
const store = require('./store');
const { deleteCanvas } = require('./canvas');
```

- [ ] **Step 2: 將 /resetcanvas handler 替換為新版**

找到現行的 `/resetcanvas` handler（約第 22-32 行），整段替換為：

```javascript
// 重置：刪除 canvas、清空 canvasId、刪除所有工時紀錄
app.command('/resetcanvas', async ({ command, ack, client }) => {
  await ack();
  const userId = command.user_id;

  try {
    await deleteCanvas(client, userId);
    store.deleteAllEntries(userId);

    const dmResult = await client.conversations.open({ users: userId });
    await client.chat.postMessage({
      channel: dmResult.channel.id,
      text: 'Canvas 與工時紀錄已全部清除。下次 `/log` 後執行 `/summary` 會重建畫板。',
    });
  } catch (err) {
    console.error('[resetcanvas] error:', err);
    try {
      const dmResult = await client.conversations.open({ users: userId });
      await client.chat.postMessage({
        channel: dmResult.channel.id,
        text: `重置過程發生錯誤：${err.data?.error || err.message}`,
      });
    } catch (_) { /* ignore secondary error */ }
  }
});
```

- [ ] **Step 3: 確認 app.js 可載入**

```bash
node -e "require('./src/app.js')" 2>&1 | head -20
```

Expected: 無 syntax error；會嘗試連線 Slack（因為執行到 `app.start()`），可能輸出錯誤或 hang——按 Ctrl+C 中斷即可。只要沒有 `SyntaxError` / `Cannot find module` 就 OK。

（若 hang 住就是 OK，代表 require 鏈通過、開始嘗試連線。）

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat(resetcanvas): 刪除 canvas + 清空 entries + 清 canvasId"
```

---

## Task 5: scheduler.js — 改為純提醒，不動 canvas

**Files:**
- Modify: `src/scheduler.js`

- [ ] **Step 1: 完整重寫 src/scheduler.js**

將檔案全部內容替換為：

```javascript
const cron = require('node-cron');
const { WebClient } = require('@slack/web-api');
const store = require('./store');
const { getTodayTaipei } = require('./date-helper');

async function runScheduledReminder() {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const today = getTodayTaipei();
  const userIds = store.getAllUserIds();

  for (const userId of userIds) {
    try {
      const dmChannelId = store.getDmChannelId(userId);
      if (!dmChannelId) continue;

      const todayEntries = store.getEntries(userId, today, today);
      const count = todayEntries[today]?.length ?? 0;

      const text = count === 0
        ? '你今天還沒有工時紀錄，記得 `/log` 或 `/start`！'
        : `你今天有 ${count} 筆工時紀錄。執行 \`/summary\` 可同步至 Canvas。`;

      await client.chat.postMessage({ channel: dmChannelId, text });
    } catch (err) {
      console.error(`[scheduler] failed for user ${userId}:`, err);
    }
  }
}

function setupScheduler() {
  // 09:00、14:00、19:00 台灣時間（Asia/Taipei），週一至週五
  const times = ['0 9 * * 1-5', '0 14 * * 1-5', '0 19 * * 1-5'];
  for (const schedule of times) {
    cron.schedule(schedule, runScheduledReminder, { timezone: 'Asia/Taipei' });
  }
  console.log('⏰ Scheduler registered: 09:00, 14:00, 19:00 (Mon-Fri, Asia/Taipei) — reminder only');
}

module.exports = { setupScheduler };
```

變更重點：
- 移除 `formatter` / `canvas` imports
- 移除 `getOrCreateCanvas` / `appendToCanvas` / `getCanvasPermalink` 呼叫
- 移除 `store.getUnwrittenEntries` / `store.markEntriesWritten` 呼叫（這些函數 Task 1 已刪除）
- `runScheduledSummary` 改名為 `runScheduledReminder`（反映新職責）
- 有紀錄時 DM 顯示筆數 + 提示執行 `/summary`；無紀錄時提醒填寫

- [ ] **Step 2: 確認 scheduler.js 可載入**

```bash
node -e "require('./src/scheduler.js')" 2>&1
```

Expected: 無輸出（靜默 exit 0）或無 error

- [ ] **Step 3: Commit**

```bash
git add src/scheduler.js
git commit -m "feat(scheduler): 改為純 DM 提醒，不再寫入 canvas"
```

---

## Task 6: 全測試通過 + 手動驗證

**Files:** 無

- [ ] **Step 1: 執行全測試**

```bash
npx jest
```

Expected:
```
PASS tests/store.test.js
PASS tests/formatter.test.js
PASS tests/summary-parse.test.js

Test Suites: 3 passed, 3 total
Tests:       XX passed
```

若有失敗，先修到全過。`store.test.js` 應新增 4 個測試（Task 1 Step 1），總數約 21。

- [ ] **Step 2: 啟動本地 bot（選做，需 .env 設好）**

```bash
node src/app.js
```

Expected: 輸出 `⏰ Scheduler registered: ...` 與 `⚡ Bot is running`。Ctrl+C 停止。

若 `.env` 未設好或 Slack connection 失敗，可跳過本步，直接部署驗證。

- [ ] **Step 3: Push 並等 Railway 部署**

```bash
git push
```

前往 Railway Dashboard 確認最新 deployment 為 Active。

- [ ] **Step 4: Slack 驗證 /summary**

在 Slack bot DM 執行：

1. `/log`（若 store 為空，先補一筆）→ 填 ASUS / 測試 / 1 → 送出
2. `/summary` → 確認 DM 訊息：
   - ✅ 出現「已將 ... 同步至 Canvas ✓」
   - ✅ 出現「開啟畫板」連結
   - ✅ 點連結能開啟 Slack canvas 頁面（不是 404）
   - ✅ Canvas 內容為全量紀錄，格式正確
3. 再執行一次 `/summary` → 確認：
   - ✅ Canvas 內容相同（冪等）
   - ✅ 新訊息的「開啟畫板」連結是**新的** URL（舊 canvas 已被刪）
   - ✅ 舊訊息的連結點開顯示「canvas 不存在」或類似錯誤——這是預期行為

- [ ] **Step 5: Slack 驗證 /resetcanvas**

1. `/resetcanvas` → 確認 DM 訊息「Canvas 與工時紀錄已全部清除」
2. 舊 canvas 連結點開 → ✅ 顯示不存在（已刪除）
3. `/summary` → ✅ 回覆「尚無任何工時紀錄」（不建 canvas）
4. `/log` 新增一筆 → `/summary` → ✅ 建立全新 canvas，內容只有剛才新增的這一筆

- [ ] **Step 6: Slack 驗證連結正確性**

隨機挑一次 `/summary` 的「開啟畫板」連結，複製 URL 確認格式為：

```
https://<workspace>.slack.com/docs/<team_id>/<canvas_id>
```

若 URL 格式為 `https://<workspace>.slack.com/docs/<canvas_id>`（少了 team_id），代表 `files.info` 失敗走了舊 fallback——檢查 bot 是否真的有 `files:read` scope。

---

## 完工檢查

- [ ] 所有 Jest 測試通過
- [ ] `/summary` 於 Canvas 顯示全量紀錄、連結可開
- [ ] 重複 `/summary` 結果冪等（內容相同，canvas_id 會換）
- [ ] `/resetcanvas` 真的清掉 canvas 與 logs.json 內的 entries
- [ ] Scheduler 的 09/14/19 點只發 DM 提醒（需等到當天時間到才能驗證，可暫不要求）
